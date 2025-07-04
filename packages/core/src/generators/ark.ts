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
} from '@google/genai';
import { BaseContentGenerator, BaseModelConfig } from './base.js';
import {
  convertOpenAIResponseToGemini,
} from '../utils/apiResponseConverter.js';
import { processStreamResponse } from '../utils/streamResponseProcessor.js';
import path from 'node:path';
import fs from 'node:fs';
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
  tool_choice?:
    | 'auto'
    | 'none'
    | { type: 'function'; function: { name: string } };
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
  private readonly defaultBaseUrl =
    'https://ark-cn-beijing.bytedance.net/api/v3';

  constructor(config: ArkModelConfig) {
    super(config);

    console.log('初始化方舟模型生成器，配置详情:', {
      model: config.model,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey ? '***已设置***' : '未设置',
      defaultBaseUrl: this.defaultBaseUrl,
      customHeaders: config.customHeaders,
      timeout: config.timeout,
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
          '您可以在方舟平台 (https://console.volcengine.com/ark) 获取API密钥',
      );
    }

    if (!this.config.model) {
      throw new Error(
        '方舟模型需要明确指定模型名称。请通过以下方式之一指定模型：\n' +
          '1. 设置 ARK_MODEL 环境变量，例如：export ARK_MODEL="ep-20250627193526-wzbxz"\n' +
          '2. 使用 --model 命令行参数，例如：--model ep-20250627193526-wzbxz\n' +
          '3. 在设置文件中配置模型名称',
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
        body: JSON.stringify(arkRequest, null, 2),
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(arkRequest),
        signal: this.config.timeout
          ? AbortSignal.timeout(this.config.timeout)
          : undefined,
      });

      console.log('方舟API响应状态:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('方舟API错误响应:', errorText);
        throw new Error(
          `方舟API错误: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data: ArkResponse = await response.json();

      if (process.env.ENABLE_API_LOG) {
        // 将响应数据写入log文件夹
        try {
          const logDir = path.join(process.cwd(), 'log');
          if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
          }
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const logFileName = `ark_response_${timestamp}.json`;
          const logFilePath = path.join(logDir, logFileName);
          fs.writeFileSync(logFilePath, JSON.stringify(data, null, 2), 'utf8');
        } catch (err) {
          // 日志写入失败不影响主流程
          console.warn('写入方舟API响应日志失败:', err);
        }
      }
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
    const arkRequest = {
      ...this.convertToArkFormat(contentsArray, request),
      stream: true,
    };
    const url = this.buildApiUrl('chat/completions');

    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(arkRequest),
      signal: this.config.timeout
        ? AbortSignal.timeout(this.config.timeout)
        : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('方舟API流式错误响应:', errorText);
      throw new Error(
        `方舟API错误: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    if (!response.body) {
      throw new Error('方舟API没有返回响应体');
    }

    const reader = response.body.getReader();

    return processStreamResponse(reader, {
      apiName: '方舟API',
      finishDataPattern: 'data: [DONE]',
      dataPrefix: 'data: ',
    });
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
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

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
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
        signal: this.config.timeout
          ? AbortSignal.timeout(this.config.timeout)
          : undefined,
      });

      if (!response.ok) {
        // 如果方舟不支持嵌入功能，返回错误信息
        if (response.status === 404) {
          throw new Error('方舟平台暂不支持内容嵌入功能');
        }
        throw new Error(
          `方舟API错误: ${response.status}: ${response.statusText}`,
        );
      }

      const data = await response.json();
      return {
        embeddings: [
          {
            values: data.data[0].embedding,
          },
        ],
      };
    } catch (error) {
      this.handleHttpError(error, 'embedContent');
    }
  }

  /**
   * Convert Gemini Content format to Ark messages format
   */
  private convertToArkFormat(
    contents: Content[],
    request: GenerateContentParameters,
  ): ArkRequest {
    // 写入请求内容到日志文件
    if (process.env.ENABLE_API_LOG) {
      try {
        // 确保log目录存在
        const logDir = path.join(process.cwd(), 'log');
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }

        // 生成日志文件名（包含时间戳）
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const logFileName = `ark_contents_${timestamp}.json`;
        const logFilePath = path.join(logDir, logFileName);
        fs.writeFileSync(
          logFilePath,
          JSON.stringify(contents, null, 2),
          'utf8',
        );
        console.log(`方舟API contents已保存到: ${logFilePath}`);
      } catch (error) {
        console.error('保存contents日志失败:', error);
      }
    }
    // 使用基类的通用转换方法
    const { messages, tools } = this.convertToOpenAIFormat(contents, request);

    // 构建基础请求
    const arkRequest: ArkRequest = {
      model: this.config.model!,
      messages,
      stream: false,
      temperature: request.config?.temperature || 0.2,
      max_tokens: request.config?.maxOutputTokens || 2048,
      top_p: request.config?.topP || 1,
      ...(tools.length > 0 && {
        tools,
        tool_choice:
          request.config?.toolConfig?.functionCallingConfig?.mode === 'NONE'
            ? 'none'
            : 'auto',
      }),
    };

    if (process.env.ENABLE_API_LOG) {
      try {
        // 确保log目录存在
        const logDir = path.join(process.cwd(), 'log');
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }

        // 生成日志文件名（包含时间戳）
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const logFileName = `ark_request_${timestamp}.json`;
        const logFilePath = path.join(logDir, logFileName);
        fs.writeFileSync(
          logFilePath,
          JSON.stringify(arkRequest, null, 2),
          'utf8',
        );
        console.log(`方舟API请求已保存到: ${logFilePath}`);
      } catch (error) {
        console.error('保存请求日志失败:', error);
      }
    }


    return arkRequest;
  }

  /**
   * Convert Ark response to Gemini format
   */
  private convertToGeminiResponse(
    response: ArkResponse,
  ): GenerateContentResponse {
    return convertOpenAIResponseToGemini(response, '方舟API');
  }

  /**
   * 构建方舟API请求的通用headers
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
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
      .map(
        (content) =>
          content.parts
            ?.map((part: Part) => ('text' in part ? part.text : ''))
            .join(' ') || '',
      )
      .join(' ');
  }
}
