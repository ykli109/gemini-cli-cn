import { GenerateContentResponse } from '@google/genai';

/**
 * OpenAI格式的工具调用接口
 */
export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * OpenAI格式的API响应接口
 */
export interface OpenAIResponse {
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 解析工具调用参数的辅助函数
 */
export function parseToolCallArgs(
  toolCall: OpenAIToolCall,
  apiName: string = 'API',
): { id: string; name: string; args: Record<string, any> } {
  try {
    const argsString = (toolCall.function.arguments || '{}').trim();
    const toolCallId = toolCall.id || `call_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    return {
      id: toolCallId,
      name: toolCall.function.name,
      args: JSON.parse(argsString),
    };
  } catch (parseError) {
    console.warn(
      `${apiName}工具调用参数解析失败:`,
      toolCall.function.name,
      toolCall.function.arguments,
      parseError,
    );
    const toolCallId = toolCall.id || `call_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    return {
      id: toolCallId,
      name: toolCall.function.name,
      args: {},
    };
  }
}

/**
 * 将OpenAI格式的API响应转换为Gemini格式
 */
export function convertOpenAIResponseToGemini(
  response: OpenAIResponse,
  apiName: string = 'API',
): GenerateContentResponse {
  const choice = response.choices[0];
  if (!choice) {
    throw new Error(`${apiName}响应中没有找到choices字段`);
  }

  const geminiResponse = new GenerateContentResponse();
  
  // 构建parts数组和functionCalls数组
  const parts = [];
  let functionCallsArray = [];

  // 添加文本内容
  if (choice.message.content) {
    parts.push({ text: choice.message.content });
  }

  // 处理工具调用
  if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
    functionCallsArray = choice.message.tool_calls.map((toolCall) => 
      parseToolCallArgs(toolCall, apiName)
    );
    
    // 添加functionCall parts
    const functionCallParts = functionCallsArray.map((fc) => ({
      functionCall: fc,
    }));
    parts.push(...functionCallParts);

    // 添加functionCalls属性
    Object.defineProperty(geminiResponse, 'functionCalls', {
      value: functionCallsArray,
      writable: false,
      enumerable: true,
      configurable: true,
    });
  }

  // 创建candidates
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

  // 设置usage元数据
  geminiResponse.usageMetadata = {
    promptTokenCount: response.usage.prompt_tokens,
    candidatesTokenCount: response.usage.completion_tokens,
    totalTokenCount: response.usage.total_tokens,
  };

  return geminiResponse;
} 