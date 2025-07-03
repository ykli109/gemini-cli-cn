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
  FunctionDeclaration,
} from '@google/genai';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
}

/**
 * 基础模型适配器配置接口
 */
export interface BaseModelConfig {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  customHeaders?: Record<string, string>;
  timeout?: number;
}

/**
 * 通用的 OpenAI 格式消息接口
 */
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content:
    | string
    | Array<{
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

/**
 * 通用的 OpenAI 格式工具接口
 */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * 通用的 OpenAI 格式转换结果
 */
export interface OpenAIFormatResult {
  messages: OpenAIMessage[];
  tools: OpenAITool[];
}

/**
 * 抽象基类，提供通用的错误处理和日志功能
 */
export abstract class BaseContentGenerator implements ContentGenerator {
  constructor(protected config: BaseModelConfig) {}

  abstract generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse>;

  abstract generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  abstract countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  abstract embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  /**
   * 将 Gemini Content 格式转换为通用的 OpenAI 格式
   */
  protected convertToOpenAIFormat(
    contents: Content[],
    request: GenerateContentParameters,
  ): OpenAIFormatResult {
    const messages: OpenAIMessage[] = [];

    // 处理系统指令
    if (request.config?.systemInstruction) {
      let systemContent = '';
      if (typeof request.config.systemInstruction === 'string') {
        systemContent = request.config.systemInstruction;
      } else if (
        typeof request.config.systemInstruction === 'object' &&
        'parts' in request.config.systemInstruction
      ) {
        systemContent =
          request.config.systemInstruction.parts
            ?.map((part: Part) => {
              if ('text' in part) {
                return part.text;
              }
              return JSON.stringify(part);
            })
            .join('\n') || '';
      }

      if (systemContent.trim()) {
        messages.push({
          role: 'system',
          content: systemContent,
        });
      }
    }

    // 处理对话内容
    for (const content of contents) {
      const role =
        content.role === 'model'
          ? 'assistant'
          : (content.role as 'system' | 'user');
      const parts = content.parts || [];

      // Handle function calls in assistant messages
      const functionCalls = parts.filter(
        (part: Part) =>
          typeof part === 'object' && part !== null && 'functionCall' in part,
      );

      // Handle function responses in user messages
      const functionResponses = parts.filter(
        (part: Part) =>
          typeof part === 'object' &&
          part !== null &&
          'functionResponse' in part,
      );

      const textParts = parts.filter(
        (part: Part): part is { text: string } =>
          typeof part === 'object' && part !== null && 'text' in part,
      );

      // Handle multimedia parts
      const multimediaParts = parts.filter(
        (part: Part) =>
          typeof part === 'object' && part !== null && 'inlineData' in part,
      );

      if (functionCalls.length > 0) {
        // Convert Gemini function calls to OpenAI tool_calls
        const tool_calls = functionCalls.map((part: any, index: number) => ({
          id: part.functionCall.id || `call_${Date.now()}_${index}`,
          type: 'function' as const,
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
        }));

        const combinedText = textParts
          .map((part: { text: string }) => part.text)
          .join('\n');
        messages.push({
          role,
          content: combinedText || '',
          tool_calls,
        });
      } else if (functionResponses.length > 0) {
        // Convert function responses to tool result messages
        for (const part of functionResponses) {
          const functionResponse = (part as any).functionResponse;
          messages.push({
            role: 'tool',
            content: JSON.stringify(functionResponse.response),
            tool_call_id: functionResponse.id,
          });
        }
      } else if (
        multimediaParts.length > 0 ||
        (textParts.length > 0 &&
          multimediaParts.length === 0 &&
          textParts.length > 1)
      ) {
        // Handle multimedia content with array format
        const contentArray = [];

        // Add text parts
        for (const part of textParts) {
          contentArray.push({
            type: 'text' as const,
            text: part.text,
          });
        }

        // Add multimedia parts
        for (const part of multimediaParts) {
          if ('inlineData' in part && part.inlineData) {
            contentArray.push({
              type: 'image_url' as const,
              image_url: {
                url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
              },
            });
          }
        }

        messages.push({
          role,
          content: contentArray,
        });
      } else if (textParts.length > 0) {
        // Simple text message
        const combinedText = textParts
          .map((part: { text: string }) => part.text)
          .join('\n');
        messages.push({
          role,
          content: combinedText,
        });
      }
    }

    // Extract tools from config if available
    const allDeclarations: FunctionDeclaration[] = [];
    if (request.config?.tools) {
      for (const tool of request.config.tools) {
        // Handle different tool types from @google/genai
        if (
          'functionDeclarations' in tool &&
          Array.isArray(tool.functionDeclarations)
        ) {
          allDeclarations.push(...tool.functionDeclarations);
        }
      }
    }
    const tools = this.convertToOpenAITools(allDeclarations);

    return { messages, tools };
  }

  /**
   * Convert Gemini function declarations to OpenAI tools format
   */
  protected convertToOpenAITools(
    functionDeclarations?: FunctionDeclaration[],
  ): OpenAITool[] {
    if (!functionDeclarations) return [];

    return functionDeclarations.map((declaration) => ({
      type: 'function' as const,
      function: {
        name: declaration.name || 'unknown_function',
        description: declaration.description || '',
        parameters: (declaration.parameters as Record<string, unknown>) || {},
      },
    }));
  }

  /**
   * 通用的HTTP请求错误处理
   */
  protected handleHttpError(error: any, operation: string): never {
    console.error(`${this.config.model} ${operation} 操作失败:`, error);
    throw new Error(`${this.config.model} ${operation} 操作失败: ${error.message}`);
  }

  /**
   * 验证配置是否完整
   */
  protected validateConfig(): void {
    if (!this.config.model) {
      throw new Error('模型名称不能为空');
    }
    if (!this.config.apiKey) {
      throw new Error('API Key 不能为空');
    }
  }
} 