/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Content,
  Part,
  ContentListUnion,
  PartUnion,
  FunctionDeclaration,
  Candidate,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { BaseContentGenerator, BaseModelConfig } from './base.js';

/**
 * Helper function to convert ContentListUnion to Content[]
 */
function toContents(contents: ContentListUnion): Content[] {
  if (Array.isArray(contents)) {
    // it's a Content[] or a PartUnion[]
    return contents.map(toContent);
  }
  // it's a Content or a PartUnion
  return [toContent(contents)];
}

function toContent(content: Content | PartUnion): Content {
  if (Array.isArray(content)) {
    // This shouldn't happen in our context, but handle it
    throw new Error('Array content not supported in this context');
  }
  if (typeof content === 'string') {
    // it's a string
    return {
      role: 'user',
      parts: [{ text: content }],
    };
  }
  if (typeof content === 'object' && content !== null && 'parts' in content) {
    // it's a Content
    return content;
  }
  // it's a Part
  return {
    role: 'user',
    parts: [content as Part],
  };
}

interface ArkMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
      url: string;
    };
  }>;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

interface ArkTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ArkRequest {
  model: string;
  messages: ArkMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  tools?: ArkTool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

interface ArkResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface ArkStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: 'function';
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
 * 方舟模型配置接口
 */
export interface ArkModelConfig extends BaseModelConfig {
  baseUrl: string;
}

/**
 * 方舟模型内容生成器
 * 支持字节跳动方舟平台的AI模型
 */
export class ArkContentGenerator extends BaseContentGenerator {
  private readonly defaultBaseUrl = 'https://ark-cn-beijing.bytedance.net/api/v3';

  constructor(config: ArkModelConfig) {
    super(config);
    
    console.log('初始化方舟模型生成器，配置详情:', {
      model: config.model,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey ? '***已设置***' : '未设置',
      defaultBaseUrl: this.defaultBaseUrl,
      customHeaders: config.customHeaders,
      timeout: config.timeout
    });
    
    this.validateArkConfig();
  }

  /**
   * 验证方舟模型特有的配置
   */
  private validateArkConfig(): void {
    this.validateConfig();
    
    if (!this.config.apiKey) {
      throw new Error(
        '方舟API密钥未设置。请通过以下方式之一设置API密钥：\n' +
        '1. 设置 ARK_API_KEY 环境变量：export ARK_API_KEY="your-api-key"\n' +
        '2. 在项目根目录创建 .env 文件，添加：ARK_API_KEY=your-api-key\n' +
        '3. 使用 --api-key 命令行参数\n\n' +
        '您可以在方舟平台 (https://console.volcengine.com/ark) 获取API密钥'
      );
    }
    
    if (!this.config.model) {
      throw new Error(
        '方舟模型需要明确指定模型名称。请通过以下方式之一指定模型：\n' +
        '1. 设置 ARK_MODEL 环境变量，例如：export ARK_MODEL="ep-20250627193526-wzbxz"\n' +
        '2. 使用 --model 命令行参数，例如：--model ep-20250627193526-wzbxz\n' +
        '3. 在设置文件中配置模型名称'
      );
    }
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    try {
      const contentsArray = toContents(request.contents);
      const arkRequest = this.convertToArkFormat(contentsArray, request);
      const url = this.buildApiUrl('chat/completions');
      
      console.log('方舟API请求详情:', {
        url,
        headers: this.buildHeaders(),
        body: JSON.stringify(arkRequest, null, 2)
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(arkRequest),
        signal: this.config.timeout ? AbortSignal.timeout(this.config.timeout) : undefined,
      });

      console.log('方舟API响应状态:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('方舟API错误响应:', errorText);
        throw new Error(`方舟API错误: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data: ArkResponse = await response.json();
      console.log('方舟API响应数据:', JSON.stringify(data, null, 2));
      return this.convertToGeminiResponse(data);
    } catch (error) {
      console.error('方舟API调用失败:', error);
      this.handleHttpError(error, 'generateContent');
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const contentsArray = toContents(request.contents);
    const arkRequest = { ...this.convertToArkFormat(contentsArray, request), stream: true };
    const url = this.buildApiUrl('chat/completions');

    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(arkRequest),
      signal: this.config.timeout ? AbortSignal.timeout(this.config.timeout) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('方舟API流式错误响应:', errorText);
      throw new Error(`方舟API错误: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('方舟API没有返回响应体');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const generator = async function* (): AsyncGenerator<GenerateContentResponse> {
      // State for accumulating tool calls across chunks
      const accumulatedToolCalls = new Map<number, {
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>();
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
            if (trimmed === '' || trimmed === 'data: [DONE]') continue;

            if (trimmed.startsWith('data: ')) {
              try {
                const jsonStr = trimmed.slice(6);
                const chunk: ArkStreamChunk = JSON.parse(jsonStr);

                if (chunk.choices && chunk.choices[0]) {
                  const choice = chunk.choices[0];

                  // Handle content delta
                  if (choice.delta.content) {
                    accumulatedContent += choice.delta.content;

                    const geminiResponse = new GenerateContentResponse();
                    geminiResponse.candidates = [{
                      content: {
                        parts: [{ text: choice.delta.content }],
                        role: 'model'
                      },
                      finishReason: undefined, // 流式响应中间chunks不应该有finishReason
                      index: 0,
                      safetyRatings: []
                    }];

                    yield geminiResponse;
                  }

                  // Handle tool calls delta
                  if (choice.delta.tool_calls) {
                    for (const toolCallDelta of choice.delta.tool_calls) {
                      const index = toolCallDelta.index ?? 0;

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
                          accumulated.function.name = (accumulated.function.name || '') + toolCallDelta.function.name;
                        }
                        if (toolCallDelta.function.arguments) {
                          accumulated.function.arguments = (accumulated.function.arguments || '') + toolCallDelta.function.arguments;
                        }
                      }
                    }
                  }

                  // Check if stream is finished
                  if (choice.finish_reason && choice.finish_reason !== null) {
                    // If we have accumulated tool calls, send them in a final response
                    if (accumulatedToolCalls.size > 0) {
                      const parts = [];

                      // Add accumulated content if any
                      if (accumulatedContent) {
                        parts.push({ text: accumulatedContent });
                      }

                      // Add completed tool calls
                      const functionCalls = Array.from(accumulatedToolCalls.values())
                        .filter(toolCall => toolCall.id && toolCall.function?.name)
                        .map(toolCall => ({
                          functionCall: {
                            id: toolCall.id!,
                            name: toolCall.function!.name!,
                            args: JSON.parse(toolCall.function!.arguments || '{}')
                          }
                        }));

                      parts.push(...functionCalls);

                      const geminiResponse = new GenerateContentResponse();
                      geminiResponse.candidates = [{
                        content: {
                          parts,
                          role: 'model'
                        },
                        finishReason: choice.finish_reason as any,
                        index: 0,
                        safetyRatings: []
                      }];

                      // Add functionCalls property using defineProperty to bypass readonly
                      const functionCallsArray = Array.from(accumulatedToolCalls.values())
                        .filter(toolCall => toolCall.id && toolCall.function?.name)
                        .map(toolCall => ({
                          id: toolCall.id!,
                          name: toolCall.function!.name!,
                          args: JSON.parse(toolCall.function!.arguments || '{}')
                        }));

                      Object.defineProperty(geminiResponse, 'functionCalls', {
                        value: functionCallsArray,
                        writable: false,
                        enumerable: true,
                        configurable: true
                      });

                      yield geminiResponse;
                    }
                    // 如果只有文本内容且已经通过delta发送了，则不需要额外的空响应
                    // 直接结束生成器
                    return; // End the generator
                  }
                }
              } catch (parseError) {
                console.warn('方舟API流式数据解析失败:', trimmed, parseError);
              }
            }
          }
        }
      } catch (streamError) {
        console.error('❌ 流式响应处理出错:');
        console.error('错误信息:', streamError);
        throw streamError;
      } finally {
        reader.releaseLock();
      }
    };

    return generator();
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    try {
      // 方舟平台可能不提供专门的token计数API，所以使用近似计算
      const contentsArray = toContents(request.contents);
      const text = this.extractTextFromContents(contentsArray);
      // 中文字符通常每个字符约等于1.5个token，英文约4字符1个token
      const approximateTokens = Math.ceil(text.length / 3);

      return {
        totalTokens: approximateTokens,
      };
    } catch (error) {
      this.handleHttpError(error, 'countTokens');
    }
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    try {
      const contentsArray = toContents(request.contents);
      const text = this.extractTextFromContents(contentsArray);

      const response = await fetch(this.buildApiUrl('embeddings'), {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          input: text,
          model: request.model || 'text-embedding-ada-002',
        }),
        signal: this.config.timeout ? AbortSignal.timeout(this.config.timeout) : undefined,
      });

      if (!response.ok) {
        // 如果方舟不支持嵌入功能，返回错误信息
        if (response.status === 404) {
          throw new Error('方舟平台暂不支持内容嵌入功能');
        }
        throw new Error(`方舟API错误: ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        embeddings: [{
          values: data.data[0].embedding,
        }],
      };
    } catch (error) {
      this.handleHttpError(error, 'embedContent');
    }
  }

  /**
   * Convert Gemini Content format to Ark messages format
   */
  private convertToArkFormat(contents: Content[], request: GenerateContentParameters): ArkRequest {
    const messages: ArkMessage[] = [];
    
    // 处理系统指令
    if (request.config?.systemInstruction) {
      let systemContent = '';
      if (typeof request.config.systemInstruction === 'string') {
        systemContent = request.config.systemInstruction;
      } else if (typeof request.config.systemInstruction === 'object' && 'parts' in request.config.systemInstruction) {
        systemContent = request.config.systemInstruction.parts?.map((part: Part) => {
          if ('text' in part) {
            return part.text;
          }
          return JSON.stringify(part);
        }).join('\n') || '';
      }
      
      if (systemContent.trim()) {
        messages.push({
          role: 'system',
          content: systemContent
        });
      }
    }

    // 处理对话内容
    for (const content of contents) {
      const role = content.role === 'model' ? 'assistant' : content.role as 'system' | 'user';
      const parts = content.parts || [];

      // Handle function calls in assistant messages
      const functionCalls = parts.filter((part: Part) => 
        typeof part === 'object' && part !== null && 'functionCall' in part
      );

      // Handle function responses in user messages
      const functionResponses = parts.filter((part: Part) =>
        typeof part === 'object' && part !== null && 'functionResponse' in part
      );

      const textParts = parts.filter((part: Part): part is { text: string } => 
        typeof part === 'object' && part !== null && 'text' in part
      );

      // Handle multimedia parts
      const multimediaParts = parts.filter((part: Part) =>
        typeof part === 'object' && part !== null && 'inlineData' in part
      );

      if (functionCalls.length > 0) {
        // Convert Gemini function calls to Ark tool_calls
        const tool_calls = functionCalls.map((part: any, index: number) => ({
          id: part.functionCall.id || `call_${Date.now()}_${index}`,
          type: 'function' as const,
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {})
          }
        }));

                 const combinedText = textParts.map((part: { text: string }) => part.text).join('\n');
         messages.push({
           role,
           content: combinedText || '',
           tool_calls
         });
      } else if (functionResponses.length > 0) {
        // Convert function responses to tool result messages
        for (const part of functionResponses) {
          const functionResponse = (part as any).functionResponse;
          messages.push({
            role: 'tool',
            content: JSON.stringify(functionResponse.response),
            tool_call_id: functionResponse.id
          });
        }
      } else if (multimediaParts.length > 0 || (textParts.length > 0 && multimediaParts.length === 0 && textParts.length > 1)) {
        // Handle multimedia content with array format
        const contentArray = [];
        
        // Add text parts
        for (const part of textParts) {
          contentArray.push({
            type: 'text' as const,
            text: part.text
          });
        }
        
        // Add multimedia parts
        for (const part of multimediaParts) {
          if ('inlineData' in part && part.inlineData) {
            contentArray.push({
              type: 'image_url' as const,
              image_url: {
                url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
              }
            });
          }
        }
        
        messages.push({
          role,
          content: contentArray
        });
      } else if (textParts.length > 0) {
        // Simple text message
        const combinedText = textParts.map((part: { text: string }) => part.text).join('\n');
        messages.push({
          role,
          content: combinedText
        });
      }
    }

    // Extract tools from config if available
    const allDeclarations: FunctionDeclaration[] = [];
    if (request.config?.tools) {
      for (const tool of request.config.tools) {
        // Handle different tool types from @google/genai
        if ('functionDeclarations' in tool && Array.isArray(tool.functionDeclarations)) {
          allDeclarations.push(...tool.functionDeclarations);
        }
      }
    }
    const arkTools = this.convertToArkTools(allDeclarations);

    // 构建基础请求
    const arkRequest: ArkRequest = {
      model: this.config.model!,
      messages,
      stream: false,
      temperature: request.config?.temperature || 0.2,
      max_tokens: request.config?.maxOutputTokens || 2048,
      top_p: request.config?.topP || 1,
      ...(arkTools.length > 0 && {
        tools: arkTools,
        tool_choice: request.config?.toolConfig?.functionCallingConfig?.mode === 'NONE' 
          ? 'none' 
          : 'auto'
      })
    };

    return arkRequest;
  }

  /**
   * Convert Gemini function declarations to Ark tools format
   */
  private convertToArkTools(functionDeclarations?: FunctionDeclaration[]): ArkTool[] {
    if (!functionDeclarations) return [];

    return functionDeclarations.map(declaration => ({
      type: 'function' as const,
      function: {
        name: declaration.name || 'unknown_function',
        description: declaration.description || '',
        parameters: (declaration.parameters as Record<string, unknown>) || {}
      }
    }));
  }

  /**
   * Convert Ark response to Gemini format
   */
  private convertToGeminiResponse(response: ArkResponse): GenerateContentResponse {
    const choice = response.choices[0];
    if (!choice) {
      throw new Error('方舟API响应中没有找到choices字段');
    }

    const geminiResponse = new GenerateContentResponse();

    // Handle tool calls in the response
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const parts = [];

      // Add text content if present
      if (choice.message.content) {
        parts.push({ text: choice.message.content });
      }

      // Add function calls
      const functionCalls = choice.message.tool_calls.map(toolCall => ({
        functionCall: {
          id: toolCall.id,
          name: toolCall.function.name,
          args: JSON.parse(toolCall.function.arguments || '{}')
        }
      }));
      parts.push(...functionCalls);

      geminiResponse.candidates = [{
        content: {
          parts,
          role: 'model'
        },
        finishReason: choice.finish_reason as any,
        index: 0,
        safetyRatings: []
      }];

      // Add functionCalls property using defineProperty to bypass readonly
      const functionCallsArray = choice.message.tool_calls.map(toolCall => ({
        id: toolCall.id,
        name: toolCall.function.name,
        args: JSON.parse(toolCall.function.arguments || '{}')
      }));

      Object.defineProperty(geminiResponse, 'functionCalls', {
        value: functionCallsArray,
        writable: false,
        enumerable: true,
        configurable: true
      });

      return geminiResponse;
    } else {
      // Regular text response
      geminiResponse.candidates = [{
        content: {
          parts: [{ text: choice.message.content || '' }],
          role: 'model'
        },
        finishReason: choice.finish_reason as any,
        index: 0,
        safetyRatings: []
      }];
    }

    geminiResponse.usageMetadata = {
      promptTokenCount: response.usage.prompt_tokens,
      candidatesTokenCount: response.usage.completion_tokens,
      totalTokenCount: response.usage.total_tokens
    };

    return geminiResponse;
  }

  /**
   * 构建方舟API请求的通用headers
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };

    if (this.config.customHeaders) {
      Object.assign(headers, this.config.customHeaders);
    }

    return headers;
  }

  /**
   * 构建完整的API URL
   */
  private buildApiUrl(endpoint: string): string {
    const baseUrl = this.config.baseUrl || this.defaultBaseUrl;
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const cleanEndpoint = endpoint.replace(/^\//, '');
    const finalUrl = `${cleanBaseUrl}/${cleanEndpoint}`;
    
    return finalUrl;
  }

  /**
   * 从Content数组中提取文本内容
   */
  private extractTextFromContents(contents: Content[]): string {
    return contents
      .map(content =>
        content.parts
          ?.map((part: Part) => ('text' in part ? part.text : ''))
          .join(' ') || ''
      )
      .join(' ');
  }
} 