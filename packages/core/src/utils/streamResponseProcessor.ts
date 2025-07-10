/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GenerateContentResponse } from '@google/genai';
import { parseToolCallArgs } from './apiResponseConverter.js';

/**
 * 流式响应块的通用接口
 */
export interface StreamChunk {
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}

/**
 * 流式响应处理器配置
 */
export interface StreamProcessorConfig {
  apiName: string;
  finishDataPattern?: string; // 例如 'data: [DONE]'
  dataPrefix?: string; // 例如 'data: '
}

/**
 * 累积的工具调用状态
 */
interface AccumulatedToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

/**
 * 通用的流式响应处理器
 * 将OpenAI格式的流式响应转换为Gemini格式的异步生成器
 */
export async function* processStreamResponse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  config: StreamProcessorConfig,
): AsyncGenerator<GenerateContentResponse> {
  const decoder = new TextDecoder();
  let buffer = '';
  
  // 配置默认值
  const finishPattern = config.finishDataPattern || 'data: [DONE]';
  const dataPrefix = config.dataPrefix || 'data: ';

  // State for accumulating tool calls across chunks
  const accumulatedToolCalls = new Map<number, AccumulatedToolCall>();
  let accumulatedContent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed === finishPattern) continue;

        if (trimmed.startsWith(dataPrefix)) {
          try {
            const jsonStr = trimmed.slice(dataPrefix.length);
            const chunk: StreamChunk = JSON.parse(jsonStr);

            if (chunk.choices && chunk.choices[0]) {
              const choice = chunk.choices[0];

              // Handle content delta
              if (choice.delta.content) {
                accumulatedContent += choice.delta.content;

                const geminiResponse = new GenerateContentResponse();
                geminiResponse.candidates = [
                  {
                    content: {
                      parts: [{ text: choice.delta.content }],
                      role: 'model',
                    },
                    finishReason: undefined, // 流式响应中间chunks不应该有finishReason
                    index: 0,
                    safetyRatings: [],
                  },
                ];

                yield geminiResponse;
              }

              // Handle tool calls delta
              if (choice.delta.tool_calls) {
                // 检查是否是一次性发送所有工具调用的情况（finish_reason为tool_calls）
                if (choice.finish_reason === 'tool_calls' && choice.delta.tool_calls.length > 1) {
                  // 一次性处理所有工具调用，每个分配唯一的index
                  choice.delta.tool_calls.forEach((toolCall, actualIndex) => {
                    const uniqueIndex = accumulatedToolCalls.size + actualIndex;
                    accumulatedToolCalls.set(uniqueIndex, {
                      id: toolCall.id || (Math.random().toString(36).slice(2) + Date.now()),
                      type: toolCall.type || 'function',
                      function: toolCall.function
                    });
                  });
                } else {
                  // 原有的增量累积逻辑
                  for (const toolCallDelta of choice.delta.tool_calls) {
                    let index = toolCallDelta.index ?? 0;
                    
                    // 如果该index已存在且工具名称不同，分配新的index
                    if (accumulatedToolCalls.has(index)) {
                      const existing = accumulatedToolCalls.get(index)!;
                      if (existing.function?.name && 
                          toolCallDelta.function?.name && 
                          existing.function.name !== toolCallDelta.function.name) {
                        // 找到一个未使用的index
                        while (accumulatedToolCalls.has(index)) {
                          index++;
                        }
                      }
                    }

                    if (!accumulatedToolCalls.has(index)) {
                      accumulatedToolCalls.set(index, {});
                    }

                    const accumulated = accumulatedToolCalls.get(index)!;

                    if (toolCallDelta.id) {
                      accumulated.id = toolCallDelta.id;
                    }
                    if (toolCallDelta.type) {
                      accumulated.type = toolCallDelta.type;
                    }
                    if (toolCallDelta.function) {
                      if (!accumulated.function) {
                        accumulated.function = {};
                      }
                      if (toolCallDelta.function.name) {
                        accumulated.function.name =
                          (accumulated.function.name || '') +
                          toolCallDelta.function.name;
                      }
                      if (toolCallDelta.function.arguments) {
                        accumulated.function.arguments =
                          (accumulated.function.arguments || '') +
                          toolCallDelta.function.arguments;
                      }
                    }
                  }
                }
              }

              // Check if stream is finished
              if (choice.finish_reason && choice.finish_reason !== null) {
                // If we have accumulated tool calls, send them in a final response
                if (accumulatedToolCalls.size > 0) {
                  const parts = [];

                  // 注意：不再添加累积的文本内容，因为它们已经通过流式chunks发送了
                  // 这避免了重复显示问题

                  // Add completed tool calls
                  const functionCallsArray = Array.from(
                    accumulatedToolCalls.values(),
                  )
                    .filter(
                      (toolCall) =>
                        toolCall.function?.name,
                    )
                    .map((toolCall) =>
                      parseToolCallArgs(
                        {
                          id: toolCall.id || (Math.random().toString(36).slice(2) + Date.now()),
                          type: 'function',
                          function: {
                            name: toolCall.function!.name!,
                            arguments:
                              toolCall.function!.arguments || '{}',
                          },
                        },
                        config.apiName,
                      ),
                    );

                  const functionCalls = functionCallsArray.map((fc) => ({
                    functionCall: fc,
                  }));

                  parts.push(...functionCalls);

                  const geminiResponse = new GenerateContentResponse();
                  geminiResponse.candidates = [
                    {
                      content: {
                        parts,
                        role: 'model',
                      },
                      finishReason: choice.finish_reason as any,
                      index: 0,
                      safetyRatings: [],
                    },
                  ];

                  // Add functionCalls property using defineProperty to bypass readonly
                  Object.defineProperty(geminiResponse, 'functionCalls', {
                    value: functionCallsArray,
                    writable: false,
                    enumerable: true,
                    configurable: true,
                  });

                  yield geminiResponse;
                }
                // 如果只有文本内容且已经通过delta发送了，则不需要额外的空响应
                // 直接结束生成器
                return; // End the generator
              }
            }
          } catch (parseError) {
            console.warn(`${config.apiName}流式数据解析失败:`, trimmed, parseError);
          }
        }
      }
    }
  } catch (streamError) {
    console.error(`❌ ${config.apiName}流式响应处理出错:`);
    console.error('错误信息:', streamError);
    throw streamError;
  } finally {
    reader.releaseLock();
  }
}
