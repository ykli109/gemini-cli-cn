# Gemini CLI API连接实现分析

## 概述

本文档详细分析了Gemini CLI如何连接和调用LLM API，包括消息构建、请求参数、endpoint地址、认证方式等核心实现细节。如果您想要修改endpoint或集成其他模型，这个文档将为您提供关键信息。

## 1. API连接架构概览

```
用户输入
    │
    ↓
GeminiChat.sendMessageStream()
    │
    ↓
ContentGenerator选择：
    ├── GoogleGenAI (API Key/Vertex AI)
    │   └── 直接调用 @google/genai SDK
    └── CodeAssistServer (OAuth2)
        └── 调用 Google Code Assist API
```

## 2. 核心API调用实现

### 2.1 消息构建和参数传递

#### 文件位置

`packages/core/src/core/geminiChat.ts` (第263-267行)

#### 核心代码

```typescript
// 单次消息发送
const apiCall = () =>
  this.contentGenerator.generateContent({
    model: this.config.getModel() || DEFAULT_GEMINI_FLASH_MODEL, // 模型名称
    contents: requestContents, // 消息历史
    config: { ...this.generationConfig, ...params.config }, // 生成配置
  });

// 流式消息发送
const apiCall = () =>
  this.contentGenerator.generateContentStream({
    model: this.config.getModel(), // 模型名称
    contents: requestContents, // 消息历史
    config: { ...this.generationConfig, ...params.config }, // 生成配置
  });
```

#### 关键参数说明

1.  **model**: 模型名称，如 `gemini-2.5-pro`、`gemini-2.5-flash`
2.  **contents**: 消息历史数组，包含用户和模型的对话
3.  **config**: 生成配置，包含 temperature、maxOutputTokens 等

#### 消息历史构建

```typescript
// 文件位置: packages/core/src/core/geminiChat.ts (第248-249行)
const userContent = createUserContent(params.message); // 创建用户消息
const requestContents = this.getHistory(true).concat(userContent); // 合并历史
```

### 2.2 生成配置参数

#### 支持的配置参数

```typescript
interface GenerateContentConfig {
  temperature?: number; // 随机性控制 (0-1)
  topP?: number; // 核采样参数
  topK?: number; // 选择前 K 个最可能的令牌
  maxOutputTokens?: number; // 最大输出令牌数
  stopSequences?: string[]; // 停止序列
  candidateCount?: number; // 候选数量
  abortSignal?: AbortSignal; // 取消信号
  tools?: Tool[]; // 工具列表
  systemInstruction?: string; // 系统指令
  thinkingConfig?: ThinkingConfig; // 思考配置
}
```

## 3. Google Gemini API 直接调用

### 3.1 SDK集成

#### 文件位置

`packages/core/src/core/contentGenerator.ts` (第85-95行)

#### 核心代码

```typescript
import { GoogleGenAI } from '@google/genai';

// 创建 Google GenAI 客户端
if (
  config.authType === AuthType.USE_GEMINI ||
  config.authType === AuthType.USE_VERTEX_AI
) {
  const googleGenAI = new GoogleGenAI({
    apiKey: config.apiKey === '' ? undefined : config.apiKey, // API 密钥
    vertexai: config.vertexai, // 是否使用 Vertex AI
    httpOptions, // HTTP 选项
  });

  return googleGenAI.models; // 返回模型客户端
}
```

#### HTTP 选项配置

```typescript
const httpOptions = {
  headers: {
    'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
  },
};
```

### 3.2 直接 API 调用示例

#### 文件位置

`packages/core/src/core/modelCheck.ts` (第31-50行)

#### 完整的 API 调用示例

```typescript
// Gemini API Endpoint
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelToTest}:generateContent?key=${apiKey}`;

// 请求体构建
const body = JSON.stringify({
  contents: [{ parts: [{ text: 'test' }] }], // 消息内容
  generationConfig: {
    maxOutputTokens: 1,
    temperature: 0,
    topK: 1,
    thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
  },
});

// HTTP 请求
const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body,
  signal: controller.signal, // 取消信号
});
```

### 3.3 Gemini API Endpoints

#### 主要 Endpoints

```
# 基础 URL
https://generativelanguage.googleapis.com/v1beta/

# 内容生成
POST /models/{model}:generateContent?key={apiKey}

# 流式内容生成
POST /models/{model}:streamGenerateContent?key={apiKey}

# 令牌计数
POST /models/{model}:countTokens?key={apiKey}

# 嵌入向量
POST /models/{model}:embedContent?key={apiKey}
```

#### 模型名称格式

```
# 在 URL 中使用的格式
models/gemini-2.5-pro
models/gemini-2.5-flash
models/gemini-embedding-001
```

## 4. Google Code Assist API 调用

### 4.1 服务端点配置

#### 文件位置

`packages/core/src/code_assist/server.ts` (第41-43行)

#### Endpoint 配置

```typescript
// 可通过环境变量修改
export const CODE_ASSIST_ENDPOINT =
  process.env.CODE_ASSIST_ENDPOINT ?? 'https://cloudcode-pa.googleapis.com';
export const CODE_ASSIST_API_VERSION = 'v1internal';
```

#### 完整 URL 构建

```typescript
// 文件位置: packages/core/src/code_assist/server.ts (第116行)
const url = `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`;

// 实际示例
// https://cloudcode-pa.googleapis.com/v1internal:generateContent
// https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent
```

### 4.2 API 调用实现

#### 文件位置

`packages/core/src/code_assist/server.ts` (第110-127行)

#### 单次调用实现

```typescript
async callEndpoint<T>(
  method: string,        // API 方法名，如 'generateContent'
  req: object,          // 请求体
  signal?: AbortSignal, // 取消信号
): Promise<T> {
  const res = await this.auth.request({  // 使用 OAuth2 认证
    url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...this.httpOptions.headers,  // 额外的 HTTP 头
    },
    responseType: 'json',
    body: JSON.stringify(req),  // JSON 序列化请求体
    signal,
  });
  return res.data as T;
}
```

#### 流式调用实现

```typescript
async streamEndpoint<T>(
  method: string,
  req: object,
  signal?: AbortSignal,
): Promise<AsyncGenerator<T>> {
  const res = await this.auth.request({
    url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`,
    method: 'POST',
    params: {
      alt: 'sse',  // Server-Sent Events 流式响应
    },
    headers: {
      'Content-Type': 'application/json',
      ...this.httpOptions.headers,
    },
    responseType: 'stream',  // 流式响应
    body: JSON.stringify(req),
    signal,
  });

  // SSE 流处理
  return (async function* (): AsyncGenerator<T> {
    const rl = readline.createInterface({
      input: res.data as PassThrough,
      crlfDelay: Infinity,
    });

    let bufferedLines: string[] = [];
    for await (const line of rl) {
      if (line === '') {
        if (bufferedLines.length === 0) continue;
        yield JSON.parse(bufferedLines.join('\n')) as T;
        bufferedLines = [];
      } else if (line.startsWith('data: ')) {
        bufferedLines.push(line.slice(6).trim());
      }
    }
  })();
}
```

### 4.3 请求格式转换

#### 文件位置

`packages/core/src/code_assist/converter.ts`

#### Gemini 格式转 Code Assist 格式

```typescript
export function toGenerateContentRequest(
  req: GenerateContentParameters, // Gemini 格式
  project?: string,
): CAGenerateContentRequest {
  // Code Assist 格式
  return {
    model: req.model, // 模型名称
    project, // Google Cloud 项目 ID
    request: toVertexGenerateContentRequest(req),
  };
}

function toVertexGenerateContentRequest(
  req: GenerateContentParameters,
): VertexGenerateContentRequest {
  return {
    contents: toContents(req.contents), // 消息内容
    systemInstruction: maybeToContent(req.config?.systemInstruction), // 系统指令
    tools: req.config?.tools, // 工具列表
    safetySettings: req.config?.safetySettings, // 安全设置
    generationConfig: toVertexGenerationConfig(req.config), // 生成配置
  };
}
```

#### 生成配置转换

```typescript
function toVertexGenerationConfig(
  config?: GenerateContentConfig,
): VertexGenerationConfig | undefined {
  if (!config) return undefined;
  return {
    temperature: config.temperature, // 随机性
    topP: config.topP, // 核采样
    topK: config.topK, // 顶部 K 采样
    maxOutputTokens: config.maxOutputTokens, // 最大输出令牌
    stopSequences: config.stopSequences, // 停止序列
    responseMimeType: config.responseMimeType, // 响应 MIME 类型
    thinkingConfig: config.thinkingConfig, // 思考配置
    // ... 其他配置参数
  };
}
```

## 5. 认证机制

### 5.1 API 密钥认证 (Gemini API)

#### 环境变量

```bash
# Gemini API 密钥
GEMINI_API_KEY=your_api_key_here

# Google API 密钥 (Vertex AI)
GOOGLE_API_KEY=your_google_api_key
GOOGLE_CLOUD_PROJECT=your_project_id
GOOGLE_CLOUD_LOCATION=your_location
```

#### 使用方式

```typescript
// API 密钥直接作为 URL 参数
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
```

### 5.2 OAuth2 认证 (Code Assist)

#### 文件位置

`packages/core/src/code_assist/oauth2.ts`

#### OAuth2 配置

```typescript
// OAuth 客户端 ID
const OAUTH_CLIENT_ID =
  '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';

// OAuth 客户端密钥
const OAUTH_CLIENT_SECRET = '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';

// OAuth 权限范围
const OAUTH_SCOPE = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];
```

#### 认证流程

```typescript
// 1. 生成认证 URL
const authUrl = client.generateAuthUrl({
  redirect_uri: `http://localhost:${port}/oauth2callback`,
  access_type: 'offline',
  scope: OAUTH_SCOPE,
  state: crypto.randomBytes(32).toString('hex'),
});

// 2. 用户浏览器认证
await open(authUrl);

// 3. 获取访问令牌
const { tokens } = await client.getToken({
  code: authorizationCode,
  redirect_uri: redirectUri,
});

// 4. 设置凭证
client.setCredentials(tokens);
```

## 6. 如何修改 Endpoint

### 6.1 修改 Gemini API Endpoint

目前 Gemini API 的 endpoint 是硬编码在 `@google/genai` SDK 中的。如果要修改，需要：

#### 方案 1：修改 SDK 源码

```typescript
// 在 node_modules/@google/genai 中找到相关文件修改 endpoint
// 但这不是推荐的做法，因为会在更新时丢失
```

#### 方案 2：创建自定义 ContentGenerator

```typescript
// 文件位置: packages/core/src/core/contentGenerator.ts

class CustomGeminiProvider implements ContentGenerator {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl; // 自定义 endpoint
    this.apiKey = apiKey;
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const endpoint = `${this.baseUrl}/models/${request.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: request.contents,
        generationConfig: request.config,
      }),
    });

    return response.json();
  }

  // 实现其他方法...
}
```

### 6.2 修改 Code Assist Endpoint

#### 通过环境变量修改

```bash
# 设置自定义 endpoint
export CODE_ASSIST_ENDPOINT=https://your-custom-endpoint.com
```

#### 直接修改代码

```typescript
// 文件位置: packages/core/src/code_assist/server.ts (第41-43行)
export const CODE_ASSIST_ENDPOINT = 'https://your-custom-endpoint.com';
export const CODE_ASSIST_API_VERSION = 'v1'; // 也可以修改 API 版本
```

## 7. 消息格式详解

### 7.1 输入消息格式

#### Content 结构

```typescript
interface Content {
  role: 'user' | 'model'; // 消息角色
  parts: Part[]; // 消息部分
}

interface Part {
  text?: string; // 文本内容
  functionCall?: FunctionCall; // 函数调用
  functionResponse?: FunctionResponse; // 函数响应
  thought?: string; // AI 思考过程
}
```

#### 实际请求示例

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "你好，请介绍一下你自己" }]
    },
    {
      "role": "model",
      "parts": [{ "text": "你好！我是 Gemini..." }]
    },
    {
      "role": "user",
      "parts": [{ "text": "你能做什么？" }]
    }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 1024,
    "topP": 0.8,
    "topK": 40
  }
}
```

### 7.2 输出响应格式

#### 单次响应

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [{ "text": "模型的回复内容" }]
      },
      "finishReason": "STOP"
    }
  ],
  "usageMetadata": {
    "promptTokens": 10,
    "candidatesTokens": 20,
    "totalTokens": 30
  }
}
```

#### 流式响应

```json
// 第一个块
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [{ "text": "模型" }]
      }
    }
  ]
}

// 第二个块
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [{ "text": "的回复" }]
      }
    }
  ]
}

// 最后一个块（包含使用统计）
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [{ "text": "内容" }]
      },
      "finishReason": "STOP"
    }
  ],
  "usageMetadata": {
    "promptTokens": 10,
    "candidatesTokens": 20,
    "totalTokens": 30
  }
}
```

## 8. 工具调用集成

### 8.1 工具定义格式

```typescript
interface Tool {
  functionDeclarations: FunctionDeclaration[];
}

interface FunctionDeclaration {
  name: string; // 函数名称
  description: string; // 函数描述
  parameters: Schema; // 参数架构
}
```

### 8.2 工具调用流程

```json
// 1. 用户请求带上工具定义
{
  "contents": [...],
  "tools": [
    {
      "functionDeclarations": [
        {
          "name": "get_weather",
          "description": "获取天气信息",
          "parameters": {
            "type": "object",
            "properties": {
              "location": { "type": "string" }
            }
          }
        }
      ]
    }
  ]
}

// 2. 模型返回函数调用
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {
            "functionCall": {
              "name": "get_weather",
              "args": { "location": "北京" }
            }
          }
        ]
      }
    }
  ]
}

// 3. 用户返回函数结果
{
  "role": "user",
  "parts": [
    {
      "functionResponse": {
        "name": "get_weather",
        "response": { "temperature": "25°C", "condition": "晴" }
      }
    }
  ]
}
```

## 9. 错误处理和重试

### 9.1 重试机制

#### 文件位置

`packages/core/src/utils/retry.ts`

#### 重试策略

```typescript
const DEFAULT_RETRY_OPTIONS = {
  maxAttempts: 5, // 最大重试次数
  initialDelayMs: 5000, // 初始延迟 5 秒
  maxDelayMs: 30000, // 最大延迟 30 秒
};

// 重试条件
function defaultShouldRetry(error: Error): boolean {
  if (error.message.includes('429')) return true; // 限流错误
  if (error.message.match(/5\d{2}/)) return true; // 5xx 服务器错误
  return false;
}
```

### 9.2 Flash 模型降级

#### 触发条件

```typescript
// 连续 2 次 429 错误且使用 OAuth2 认证
if (
  consecutive429Count >= 2 &&
  onPersistent429 &&
  authType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL
) {
  const fallbackModel = await onPersistent429(authType);
  if (fallbackModel) {
    // 切换到 Flash 模型并重置重试计数
    this.config.setModel(fallbackModel);
  }
}
```

## 10. 性能优化

### 10.1 连接复用

```typescript
// HTTP 连接复用通过 @google/genai SDK 内部实现
// OAuth2 客户端复用
const client = new OAuth2Client({
  /* ... */
});
```

### 10.2 流式处理

```typescript
// 流式响应减少内存使用和延迟
for await (const chunk of streamResponse) {
  yield chunk; // 实时输出，不等待完整响应
}
```

### 10.3 并发控制

```typescript
// 通过 sendPromise 确保消息顺序处理
await this.sendPromise;
this.sendPromise = processMessage();
```

## 11. 安全考虑

### 11.1 API 密钥保护

```typescript
// API 密钥不会记录在日志中
// 使用环境变量存储
const apiKey = process.env.GEMINI_API_KEY;
```

### 11.2 请求验证

```typescript
// 请求超时控制
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 2000);

// CSRF 防护（OAuth2）
const state = crypto.randomBytes(32).toString('hex');
```

## 12. 总结

Gemini CLI 的 API 连接实现展现了以下特点：

1.  **双路径支持**：同时支持 Gemini API 和 Code Assist API
2.  **灵活认证**：API 密钥和 OAuth2 两种认证方式
3.  **健壮性**：内置重试、降级和错误处理
4.  **性能优化**：流式处理、连接复用和并发控制
5.  **可扩展性**：通过 ContentGenerator 接口支持多种后端

### 修改 Endpoint 的建议

1.  **Code Assist API**：直接修改环境变量 `CODE_ASSIST_ENDPOINT`
2.  **Gemini API**：创建自定义 ContentGenerator 实现
3.  **新模型支持**：参考 `docs/multi-model-support-plan.md` 中的方案

这个架构为集成其他 AI 模型提供商（如 Claude、OpenAI 等）提供了良好的基础。
