import {
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  Content,
  Part,
  ContentListUnion,
  PartUnion,
} from '@google/genai';
import { BaseContentGenerator, BaseModelConfig } from './base.js';
import path from 'node:path';
import fs from 'node:fs';
import { convertOpenAIResponseToGemini } from '../utils/apiResponseConverter.js';
import { processStreamResponse } from '../utils/streamResponseProcessor.js';

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

/**
 * GPT OpenAPI 请求格式
 */
interface GptOpenApiMessage {
  role: 'system' | 'user' | 'assistant';
  content:
    | string
    | Array<{
        type: 'text' | 'image_url' | 'tool_result';
        text?: string;
        image_url?: {
          url: string;
        };
        tool_call_id?: string;
        content?: string;
      }>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface GptOpenApiTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: any;
  };
}

interface GptOpenApiRequest {
  model: string;
  messages: GptOpenApiMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
  tools?: GptOpenApiTool[];
  tool_choice?:
    | 'none'
    | 'auto'
    | { type: 'function'; function: { name: string } };
  thinking?: {
    type: 'enabled';
    budget_tokens: number;
  };
}

interface GptOpenApiResponse {
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
 * GPT OpenAPI模型配置接口
 */
export interface GPTOpenApitModelConfig extends BaseModelConfig {
  baseUrl: string;
  organizationId?: string;
  projectId?: string;
  logId?: string;
}

/**
 * GPT OpenAPI模型内容生成器
 * 支持字节跳动GPT OpenAPI的AI模型
 */
export class GPTOpenApitContentGenerator extends BaseContentGenerator {
  private readonly defaultBaseUrl =
    'https://gpt-i18n.byteintl.net/gpt/openapi/online/v2';

  constructor(config: GPTOpenApitModelConfig) {
    super(config);

    console.log('初始化GPT OpenAPI模型生成器，配置详情:', {
      model: config.model,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey ? '***已设置***' : '未设置',
      defaultBaseUrl: this.defaultBaseUrl,
      organizationId: config.organizationId,
      projectId: config.projectId,
      customHeaders: config.customHeaders,
      timeout: config.timeout,
    });

    this.validateGPTOpenApitConfig();
  }

  /**
   * 验证GPTOpenApit模型特有的配置
   */
  private validateGPTOpenApitConfig(): void {
    this.validateConfig();

    if (!this.config.apiKey) {
      throw new Error(
        'GPT OpenAPI密钥未设置。请通过以下方式之一设置API密钥：\n' +
          '1. 设置 GPT_OPENAPI_API_KEY 环境变量：export GPT_OPENAPI_API_KEY="your-api-key"\n' +
          '2. 在项目根目录创建 .env 文件，添加：GPT_OPENAPI_API_KEY=your-api-key\n' +
          '3. 使用 --api-key 命令行参数\n\n' +
          '适用于所有OpenAPI兼容的GPT服务提供商',
      );
    }

    if (!this.config.model) {
      throw new Error(
        'GPT OpenAPI模型需要明确指定模型名称。请通过以下方式之一指定模型：\n' +
          '1. 设置 GPT_OPENAPI_MODEL 环境变量，例如：export GPT_OPENAPI_MODEL="gcp-claude4-sonnet"\n' +
          '2. 使用 --model 命令行参数，例如：--model gcp-claude4-sonnet\n' +
          '3. 在设置文件中配置模型名称',
      );
    }
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    try {
      const contentsArray = toContents(request.contents);
      const gptOpenApiRequest = this.convertToGptOpenApiFormat(
        contentsArray,
        request,
      );
      const url = this.buildApiUrl('chat/completions');

      console.log('GPT OpenAPI请求详情:', {
        url,
        headers: this.buildHeaders(),
        body: JSON.stringify(gptOpenApiRequest, null, 2),
      });

      // 验证请求体是否有效
      if (
        !gptOpenApiRequest.messages ||
        gptOpenApiRequest.messages.length === 0
      ) {
        throw new Error('GPT OpenAPI请求必须包含至少一条消息');
      }

      if (!gptOpenApiRequest.model) {
        throw new Error('GPT OpenAPI请求必须指定模型名称');
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(gptOpenApiRequest),
        signal: this.config.timeout
          ? AbortSignal.timeout(this.config.timeout)
          : undefined,
      });

      console.log('GPT OpenAPI响应状态:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('GPT OpenAPI错误响应:', errorText);

        let errorMessage = `GPT OpenAPI错误: ${response.status} ${response.statusText}`;

        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error && errorData.error.message) {
            errorMessage += ` - ${errorData.error.message}`;
          } else if (errorData.message) {
            errorMessage += ` - ${errorData.message}`;
          }
        } catch {
          // 如果解析JSON失败，使用原始错误文本
          errorMessage += ` - ${errorText}`;
        }

        throw new Error(errorMessage);
      }

      const data: GptOpenApiResponse = await response.json();
      console.log('GPT OpenAPI响应数据:', JSON.stringify(data, null, 2));

      // 将响应数据写入log文件夹
      if (process.env.ENABLE_API_LOG) {
        try {
          const logDir = path.join(process.cwd(), 'log');
          if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
          }
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const logFileName = `gpt_openapi_response_${timestamp}.json`;
          const logFilePath = path.join(logDir, logFileName);
          fs.writeFileSync(logFilePath, JSON.stringify(data, null, 2), 'utf8');
        } catch (err) {
          // 日志写入失败不影响主流程
          console.warn('写入GPT OpenAPI响应日志失败:', err);
        }
      }
      // 验证响应数据格式
      if (!data.choices || data.choices.length === 0) {
        throw new Error('GPT OpenAPI响应格式错误：缺少choices字段');
      }

      return this.convertToGeminiResponse(data);
    } catch (error) {
      console.error('GPTOpenApit API调用失败:', error);
      this.handleHttpError(error, 'generateContent');
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const contentsArray = toContents(request.contents);
    const gptOpenApiRequest = {
      ...this.convertToGptOpenApiFormat(contentsArray, request),
      stream: true,
    };
    const url = this.buildApiUrl('chat/completions');

    // 验证请求体是否有效
    if (
      !gptOpenApiRequest.messages ||
      gptOpenApiRequest.messages.length === 0
    ) {
      throw new Error('GPT OpenAPI流式请求必须包含至少一条消息');
    }

    if (!gptOpenApiRequest.model) {
      throw new Error('GPT OpenAPI流式请求必须指定模型名称');
    }

    console.log('GPT OpenAPI流式请求详情:', {
      url,
      headers: this.buildHeaders(),
      messageCount: gptOpenApiRequest.messages.length,
      model: gptOpenApiRequest.model,
      toolsCount: gptOpenApiRequest.tools?.length || 0,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(gptOpenApiRequest),
      signal: this.config.timeout
        ? AbortSignal.timeout(this.config.timeout)
        : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GPT OpenAPI流式错误响应:', errorText);

      let errorMessage = `GPT OpenAPI流式错误: ${response.status} ${response.statusText}`;

      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error && errorData.error.message) {
          errorMessage += ` - ${errorData.error.message}`;
        } else if (errorData.message) {
          errorMessage += ` - ${errorData.message}`;
        }
      } catch {
        // 如果解析JSON失败，使用原始错误文本
        errorMessage += ` - ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    if (!response.body) {
      throw new Error('GPT OpenAPI没有返回响应体');
    }

    const reader = response.body.getReader();

    return processStreamResponse(reader, {
      apiName: 'GPT OpenAPI',
      finishDataPattern: 'data: [DONE]',
      dataPrefix: 'data: ',
    });
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    try {
      // GPT OpenAPI平台可能不提供专门的token计数API，所以使用近似计算
      const contentsArray = toContents(request.contents);
      const text = this.extractTextFromContents(contentsArray);
      // 英文约4字符1个token，中文字符通常每个字符约等于1.5个token
      const approximateTokens = Math.ceil(text.length / 3.5);

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
          model: request.model || 'text-embedding-3-small',
        }),
        signal: this.config.timeout
          ? AbortSignal.timeout(this.config.timeout)
          : undefined,
      });

      if (!response.ok) {
        // 如果GPT OpenAPI不支持嵌入功能，返回错误信息
        if (response.status === 404) {
          throw new Error('GPT OpenAPI平台暂不支持内容嵌入功能');
        }
        throw new Error(
          `GPT OpenAPI错误: ${response.status}: ${response.statusText}`,
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
   * Convert Gemini Content format to GPT OpenAPI messages format
   */
  private convertToGptOpenApiFormat(
    contents: Content[],
    request: GenerateContentParameters,
  ): GptOpenApiRequest {
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
        const logFileName = `gpt_openapi_contents_${timestamp}.json`;
        const logFilePath = path.join(logDir, logFileName);
        fs.writeFileSync(
          logFilePath,
          JSON.stringify(contents, null, 2),
          'utf8',
        );
        console.log(`GPT OpenAPI contents已保存到: ${logFilePath}`);
      } catch (error) {
        console.error('保存contents日志失败:', error);
      }
    }
    // 使用基类的通用转换方法
    const { messages, tools } = this.convertToOpenAIFormat(contents, request);

    // GPT OpenAPI不支持 role: 'tool'，需要转换为 user 角色
    const gptOpenApiMessages = messages.map((message) => {
      return message;
    });

    // 将通用 GPTOpenApit 工具格式转换为 GPT OpenAPI 特定格式
    const gptOpenApiTools: GptOpenApiTool[] = tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.function.name,
        description: tool.function.description || `工具: ${tool.function.name}`,
        parameters: tool.function.parameters,
      },
    }));

    // 构建基础请求
    const gptOpenApiRequest: GptOpenApiRequest = {
      model: this.config.model!,
      messages: gptOpenApiMessages as GptOpenApiMessage[],
      stream: false,
      temperature: request.config?.temperature || 0.2,
      max_tokens: request.config?.maxOutputTokens || 2048,
      top_p: request.config?.topP || 1,
      ...(gptOpenApiTools.length > 0 && {
        tools: gptOpenApiTools,
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
        const logFileName = `gpt_openapi_request_${timestamp}.json`;
        const logFilePath = path.join(logDir, logFileName);
        fs.writeFileSync(
          logFilePath,
          JSON.stringify(gptOpenApiRequest, null, 2),
          'utf8',
        );
        console.log(`GPT OpenAPI请求已保存到: ${logFilePath}`);
      } catch (error) {
        console.error('保存请求日志失败:', error);
      }
    }

    return gptOpenApiRequest;
  }

  /**
   * Convert GPT OpenAPI response to Gemini format
   * 支持处理混合的Claude+GPTOpenApit响应格式
   */
  private convertToGeminiResponse(
    data: GptOpenApiResponse,
  ): GenerateContentResponse {
    return convertOpenAIResponseToGemini(data, 'GPT OpenAPI');
  }

  /**
   * 构建GPT OpenAPI请求的通用headers
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 添加Authorization header（如果不是通过URL参数认证）
    const config = this.config as GPTOpenApitModelConfig;
    if (this.config.apiKey && !config.baseUrl?.includes('byteintl.net')) {
      // 对于标准OpenAPI，使用Bearer token
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    // 添加LogID（如果提供）
    if (config.logId) {
      headers['X-TT-LOGID'] = config.logId;
    } else {
      // 生成默认的LogID
      headers['X-TT-LOGID'] =
        `gemini-cli-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // 添加其他自定义headers
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

    // 对于标准的OpenAPI格式，直接使用传入的endpoint
    // 如果是字节跳动特殊格式，需要额外处理
    if (endpoint === 'chat/completions') {
      // 对于字节跳动GPT OpenAPI，使用crawl端点并添加ak参数
      return `${cleanBaseUrl}/crawl?ak=${this.config.apiKey}`;
    } else {
      // 对于其他端点（如embeddings），使用标准格式
      return `${cleanBaseUrl}/${endpoint}`;
    }
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
