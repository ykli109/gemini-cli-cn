# 多模型支持方案：集成AWS Claude模型

## 概述

本文档详细描述了如何扩展Gemini CLI以支持多个AI模型提供商，特别是AWS Claude模型。当前项目仅支持Google Gemini模型，我们将设计一个可扩展的架构来支持多个模型提供商。

## 当前架构分析

### 现有模型集成点

1. **ContentGenerator接口** (`packages/core/src/core/contentGenerator.ts`)

   - 定义了核心的内容生成接口
   - 包含：`generateContent()`, `generateContentStream()`, `countTokens()`, `embedContent()`

2. **AuthType枚举** (`packages/core/src/core/contentGenerator.ts`)

   - 当前支持：`LOGIN_WITH_GOOGLE_PERSONAL`, `USE_GEMINI`, `USE_VERTEX_AI`

3. **ContentGeneratorConfig** (`packages/core/src/core/contentGenerator.ts`)

   - 配置模型、API密钥、认证类型等

4. **GeminiClient** (`packages/core/src/core/client.ts`)
   - 封装了与Gemini API的交互
   - 依赖ContentGenerator进行实际的API调用

### 限制和挑战

1. **硬编码的Gemini依赖**：多处代码直接依赖Google Gemini API
2. **单一认证体系**：认证逻辑与Google服务紧密耦合
3. **模型特定功能**：如thinking模式、Flash fallback等
4. **API响应格式差异**：不同提供商的API响应格式不同

## 设计方案

### 1. 抽象层设计

#### 1.1 ModelProvider抽象接口

```typescript
// packages/core/src/providers/base/ModelProvider.ts
export interface ModelProvider {
  readonly name: string;
  readonly supportedModels: string[];
  readonly supportedFeatures: ModelFeature[];

  // 核心方法
  generateContent(
    request: GenerateContentRequest,
  ): Promise<GenerateContentResponse>;
  generateContentStream(
    request: GenerateContentRequest,
  ): AsyncGenerator<GenerateContentResponse>;
  countTokens(request: CountTokensRequest): Promise<CountTokensResponse>;
  embedContent?(request: EmbedContentRequest): Promise<EmbedContentResponse>;

  // 认证和配置
  validateConfig(config: ModelProviderConfig): Promise<boolean>;
  initialize(config: ModelProviderConfig): Promise<void>;
}

export enum ModelFeature {
  STREAMING = 'streaming',
  FUNCTION_CALLING = 'function_calling',
  THINKING = 'thinking',
  EMBEDDINGS = 'embeddings',
  VISION = 'vision',
  SYSTEM_INSTRUCTIONS = 'system_instructions',
}
```

#### 1.2 统一的请求/响应格式

```typescript
// packages/core/src/providers/base/types.ts
export interface GenerateContentRequest {
  model: string;
  messages: Message[];
  systemInstruction?: string;
  tools?: Tool[];
  config?: GenerationConfig;
  signal?: AbortSignal;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: Content[];
}

export interface Content {
  type: 'text' | 'image' | 'function_call' | 'function_response';
  text?: string;
  imageUrl?: string;
  functionCall?: FunctionCall;
  functionResponse?: FunctionResponse;
}

export interface GenerateContentResponse {
  content: Content[];
  usage?: UsageMetadata;
  finishReason?: string;
  functionCalls?: FunctionCall[];
  thinking?: ThinkingContent;
}
```

### 2. AWS Claude Provider实现

#### 2.1 Claude Provider类

```typescript
// packages/core/src/providers/aws/ClaudeProvider.ts
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';

export class ClaudeProvider implements ModelProvider {
  readonly name = 'claude';
  readonly supportedModels = [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ];

  readonly supportedFeatures = [
    ModelFeature.STREAMING,
    ModelFeature.FUNCTION_CALLING,
    ModelFeature.VISION,
    ModelFeature.SYSTEM_INSTRUCTIONS,
  ];

  private client: BedrockRuntimeClient;

  async initialize(config: ClaudeProviderConfig): Promise<void> {
    this.client = new BedrockRuntimeClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        sessionToken: config.sessionToken,
      },
    });
  }

  async generateContent(
    request: GenerateContentRequest,
  ): Promise<GenerateContentResponse> {
    const claudeRequest = this.convertToClaudeFormat(request);
    const command = new InvokeModelCommand({
      modelId: request.model,
      body: JSON.stringify(claudeRequest),
    });

    const response = await this.client.send(command);
    const claudeResponse = JSON.parse(new TextDecoder().decode(response.body));

    return this.convertFromClaudeFormat(claudeResponse);
  }

  async *generateContentStream(
    request: GenerateContentRequest,
  ): AsyncGenerator<GenerateContentResponse> {
    const claudeRequest = this.convertToClaudeFormat(request);
    const command = new InvokeModelWithResponseStreamCommand({
      modelId: request.model,
      body: JSON.stringify(claudeRequest),
    });

    const response = await this.client.send(command);

    for await (const chunk of response.body) {
      if (chunk.chunk?.bytes) {
        const chunkData = JSON.parse(
          new TextDecoder().decode(chunk.chunk.bytes),
        );
        yield this.convertFromClaudeFormat(chunkData);
      }
    }
  }

  private convertToClaudeFormat(request: GenerateContentRequest): any {
    // 转换统一格式到Claude API格式
    return {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: request.config?.maxOutputTokens || 4096,
      temperature: request.config?.temperature || 0,
      system: request.systemInstruction,
      messages: request.messages.map((msg) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content.map((c) => {
          if (c.type === 'text') return { type: 'text', text: c.text };
          if (c.type === 'image')
            return {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: c.imageUrl,
              },
            };
          return c;
        }),
      })),
      tools: request.tools
        ? this.convertToolsToClaudeFormat(request.tools)
        : undefined,
    };
  }

  private convertFromClaudeFormat(
    claudeResponse: any,
  ): GenerateContentResponse {
    // 转换Claude API响应到统一格式
    return {
      content:
        claudeResponse.content?.map((c) => ({
          type: c.type === 'text' ? 'text' : c.type,
          text: c.text,
        })) || [],
      usage: {
        promptTokens: claudeResponse.usage?.input_tokens,
        candidatesTokens: claudeResponse.usage?.output_tokens,
        totalTokens:
          (claudeResponse.usage?.input_tokens || 0) +
          (claudeResponse.usage?.output_tokens || 0),
      },
      finishReason: claudeResponse.stop_reason,
      functionCalls: claudeResponse.content
        ?.filter((c) => c.type === 'tool_use')
        .map((c) => ({
          name: c.name,
          args: c.input,
          id: c.id,
        })),
    };
  }
}
```

#### 2.2 Claude认证配置

```typescript
// packages/core/src/providers/aws/types.ts
export interface ClaudeProviderConfig extends ModelProviderConfig {
  provider: 'claude';
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export enum ClaudeAuthType {
  AWS_CREDENTIALS = 'aws-credentials',
  AWS_PROFILE = 'aws-profile',
  AWS_IAM_ROLE = 'aws-iam-role',
}
```

### 3. Provider注册和管理系统

#### 3.1 ProviderRegistry

```typescript
// packages/core/src/providers/ProviderRegistry.ts
export class ProviderRegistry {
  private providers = new Map<string, ModelProvider>();

  registerProvider(provider: ModelProvider): void {
    this.providers.set(provider.name, provider);
  }

  getProvider(name: string): ModelProvider | undefined {
    return this.providers.get(name);
  }

  getProviderForModel(modelName: string): ModelProvider | undefined {
    for (const provider of this.providers.values()) {
      if (provider.supportedModels.includes(modelName)) {
        return provider;
      }
    }
    return undefined;
  }

  getAllProviders(): ModelProvider[] {
    return Array.from(this.providers.values());
  }

  getSupportedModels(): string[] {
    const models: string[] = [];
    for (const provider of this.providers.values()) {
      models.push(...provider.supportedModels);
    }
    return models;
  }
}
```

#### 3.2 默认Provider注册

```typescript
// packages/core/src/providers/index.ts
import { GeminiProvider } from './google/GeminiProvider.js';
import { ClaudeProvider } from './aws/ClaudeProvider.js';

export function createDefaultProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();

  // 注册Google Gemini Provider
  registry.registerProvider(new GeminiProvider());

  // 注册AWS Claude Provider
  registry.registerProvider(new ClaudeProvider());

  return registry;
}
```

### 4. 配置系统扩展

#### 4.1 扩展AuthType

```typescript
// packages/core/src/core/contentGenerator.ts
export enum AuthType {
  // 现有的Gemini认证类型
  LOGIN_WITH_GOOGLE_PERSONAL = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',

  // 新增的Claude认证类型
  USE_CLAUDE_AWS_CREDENTIALS = 'claude-aws-credentials',
  USE_CLAUDE_AWS_PROFILE = 'claude-aws-profile',
  USE_CLAUDE_AWS_IAM_ROLE = 'claude-aws-iam-role',
}
```

#### 4.2 扩展Settings接口

```typescript
// packages/cli/src/config/settings.ts
export interface Settings {
  // 现有设置...

  // 新增模型提供商设置
  modelProvider?: string; // 'gemini' | 'claude'
  model?: string; // 具体模型名称

  // AWS Claude特定设置
  aws?: {
    region?: string;
    profile?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
}
```

#### 4.3 环境变量支持

```bash
# AWS Claude配置
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_SESSION_TOKEN=your_session_token  # 可选
AWS_PROFILE=your_profile  # 或使用AWS配置文件

# 模型选择
GEMINI_MODEL_PROVIDER=claude
GEMINI_MODEL=claude-3-5-sonnet-20241022
```

### 5. 客户端层重构

#### 5.1 通用ModelClient

```typescript
// packages/core/src/core/ModelClient.ts
export class ModelClient {
  private providerRegistry: ProviderRegistry;
  private currentProvider: ModelProvider;

  constructor(private config: Config) {
    this.providerRegistry = createDefaultProviderRegistry();
  }

  async initialize(providerConfig: ModelProviderConfig): Promise<void> {
    const provider = this.providerRegistry.getProvider(providerConfig.provider);
    if (!provider) {
      throw new Error(`Unsupported provider: ${providerConfig.provider}`);
    }

    await provider.initialize(providerConfig);
    this.currentProvider = provider;
  }

  async *sendMessageStream(
    request: PartListUnion,
    signal: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    // 转换请求格式
    const modelRequest = this.convertToModelRequest(request);

    // 调用当前provider
    const responseStream =
      this.currentProvider.generateContentStream(modelRequest);

    // 转换响应格式并生成事件
    for await (const response of responseStream) {
      yield* this.convertToGeminiEvents(response);
    }
  }

  private convertToModelRequest(
    request: PartListUnion,
  ): GenerateContentRequest {
    // 转换Gemini格式到统一格式
  }

  private *convertToGeminiEvents(
    response: GenerateContentResponse,
  ): Generator<ServerGeminiStreamEvent> {
    // 转换统一响应格式到Gemini事件格式
  }
}
```

### 6. UI层扩展

#### 6.1 模型选择器组件

```typescript
// packages/cli/src/ui/components/ModelSelector.tsx
export const ModelSelector = ({ onModelSelect }: { onModelSelect: (provider: string, model: string) => void }) => {
  const [selectedProvider, setSelectedProvider] = useState('gemini');
  const [selectedModel, setSelectedModel] = useState('');

  const providers = {
    gemini: {
      name: 'Google Gemini',
      models: ['gemini-2.5-pro', 'gemini-2.5-flash']
    },
    claude: {
      name: 'AWS Claude',
      models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
    }
  };

  return (
    <Box flexDirection="column">
      <Text>Select AI Model Provider:</Text>
      <SelectInput
        items={Object.entries(providers).map(([key, value]) => ({
          label: value.name,
          value: key
        }))}
        onSelect={(item) => setSelectedProvider(item.value)}
      />

      <Text>Select Model:</Text>
      <SelectInput
        items={providers[selectedProvider].models.map(model => ({
          label: model,
          value: model
        }))}
        onSelect={(item) => {
          setSelectedModel(item.value);
          onModelSelect(selectedProvider, item.value);
        }}
      />
    </Box>
  );
};
```

#### 6.2 扩展认证对话框

```typescript
// packages/cli/src/ui/components/AuthDialog.tsx
const authOptions = [
  // 现有Gemini选项...

  // 新增Claude选项
  {
    label: 'AWS Claude (Credentials)',
    value: AuthType.USE_CLAUDE_AWS_CREDENTIALS,
    description: 'Use AWS access keys for Claude models',
  },
  {
    label: 'AWS Claude (Profile)',
    value: AuthType.USE_CLAUDE_AWS_PROFILE,
    description: 'Use AWS CLI profile for Claude models',
  },
];
```

### 7. 实施步骤

#### 阶段1：基础架构重构（2-3周）

1. **创建Provider抽象层**

- 定义ModelProvider接口
- 创建统一的请求/响应类型
- 实现ProviderRegistry

2. **重构现有Gemini集成**

- 将现有代码包装为GeminiProvider
- 保持向后兼容性
- 更新测试

3. **扩展配置系统**

- 添加新的认证类型
- 扩展Settings接口
- 更新配置验证逻辑

#### 阶段2：Claude Provider实现（2-3周）

1. **实现ClaudeProvider**

- AWS SDK集成
- API格式转换
- 错误处理

2. **认证系统集成**

- AWS凭证管理
- 配置验证
- 环境变量支持

3. **功能特性映射**

- 工具调用支持
- 流式响应
- 令牌计数

#### 阶段3：UI和用户体验（1-2周）

1. **模型选择界面**

- 添加模型选择器
- 更新认证对话框
- 设置页面扩展

2. **错误处理和提示**

- 特定于提供商的错误消息
- 配置指导
- 状态指示器

#### 阶段4：测试和文档（1周）

1. **全面测试**

- 单元测试
- 集成测试
- 端到端测试

2. **文档更新**

- 用户指南
- 配置示例
- 故障排除

### 8. 依赖项和安装

#### 8.1 新增依赖

```json
{
  "dependencies": {
    "@aws-sdk/client-bedrock-runtime": "^3.x.x",
    "@aws-sdk/credential-providers": "^3.x.x"
  }
}
```

#### 8.2 可选依赖处理

为了保持包大小合理，AWS SDK应该作为可选依赖：

```typescript
// packages/core/src/providers/aws/ClaudeProvider.ts
let BedrockRuntimeClient: any;

try {
  const aws = await import('@aws-sdk/client-bedrock-runtime');
  BedrockRuntimeClient = aws.BedrockRuntimeClient;
} catch (error) {
  throw new Error(
    'AWS SDK not installed. Run: npm install @aws-sdk/client-bedrock-runtime',
  );
}
```

### 9. 配置示例

#### 9.1 用户设置文件示例

```json
{
  "modelProvider": "claude",
  "model": "claude-3-5-sonnet-20241022",
  "selectedAuthType": "claude-aws-credentials",
  "aws": {
    "region": "us-east-1"
  }
}
```

#### 9.2 环境变量配置

```bash
# .env文件
GEMINI_MODEL_PROVIDER=claude
GEMINI_MODEL=claude-3-5-sonnet-20241022
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
```

### 10. 向后兼容性

1. **默认行为保持不变**：如果没有指定provider，继续使用Gemini
2. **现有配置继续工作**：所有现有的Gemini配置保持有效
3. **渐进式迁移**：用户可以逐步迁移到新的配置格式

### 11. 扩展性考虑

这个架构设计为支持更多模型提供商做好了准备：

1. **OpenAI Provider**：可以轻松添加GPT模型支持
2. **Azure OpenAI Provider**：支持Azure托管的OpenAI模型
3. **本地模型Provider**：支持Ollama等本地模型
4. **自定义Provider**：允许用户实现自己的模型提供商

### 12. 风险和缓解措施

#### 风险

1. **API差异**：不同提供商的API功能差异可能导致功能缺失
2. **性能影响**：抽象层可能带来性能开销
3. **复杂性增加**：代码复杂度和维护成本增加

#### 缓解措施

1. **功能特性标记**：明确标记每个提供商支持的功能
2. **性能测试**：确保抽象层开销最小
3. **渐进式实施**：分阶段实施，确保每个阶段都是稳定的
4. **全面测试**：为每个提供商编写完整的测试套件

### 13. 总结

这个方案提供了一个可扩展的架构来支持多个AI模型提供商，同时保持向后兼容性和代码的可维护性。通过抽象层设计，我们可以轻松添加新的模型提供商，而不需要大幅修改现有代码。

实施这个方案后，用户将能够：

1. 在Gemini和Claude模型之间自由切换
2. 使用统一的界面和配置系统
3. 享受相同的功能特性（如工具调用、流式响应等）
4. 为未来支持更多模型提供商做好准备

这个设计既满足了当前支持Claude模型的需求，也为未来的扩展奠定了坚实的基础。
