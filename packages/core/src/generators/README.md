# Model Generators / 模型适配器

这个目录包含了不同AI模型的适配器实现，用于将各种模型的API标准化为统一的接口。

## 目录结构

```
generators/
├── README.md          # 本文档
├── index.ts          # 导出所有适配器
├── base.ts           # 基础接口和抽象类
├── ark.ts            # 方舟模型适配器
└── gpt_openapi.ts    # GPT OpenAPI模型适配器
```

## 核心组件

### 1. BaseContentGenerator 抽象类

位于 `base.ts`，提供：

- 统一的 `ContentGenerator` 接口
- 通用的错误处理逻辑
- 配置验证方法
- 基础的HTTP工具方法

### 2. 具体模型适配器

每个模型适配器都继承自 `BaseContentGenerator`，实现：

- `generateContent()` - 生成内容
- `generateContentStream()` - 流式生成内容
- `countTokens()` - 计算token数量
- `embedContent()` - 内容嵌入

## 如何添加新的模型适配器

### 步骤1：创建适配器文件

创建新的适配器文件，命名为你的模型名称，例如 `your_model.ts`。可以参考 `ark.ts` 或 `gpt_openapi.ts` 的实现结构。

### 步骤2：定义配置接口

```typescript
export interface YourModelConfig extends BaseModelConfig {
  organizationId?: string;
  projectId?: string;
  // 添加模型特有的配置
}
```

### 步骤3：实现适配器类

```typescript
export class YourModelContentGenerator extends BaseContentGenerator {
  constructor(config: YourModelConfig) {
    super(config);
    this.validateYourModelConfig();
  }

  // 实现所有抽象方法
  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    // 具体实现
  }

  // ... 其他方法
}
```

### 步骤4：更新导出

在 `index.ts` 中添加新的导出：

```typescript
export { YourModelContentGenerator, YourModelConfig } from './your_model.js';
```

### 步骤5：更新主配置

在 `../core/contentGenerator.ts` 中：

1. 添加新的认证类型：

```typescript
export enum AuthType {
  LOGIN_WITH_GOOGLE_PERSONAL = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  USE_ARK = 'ark',
  USE_GPT_OPENAPI = 'gpt-openapi',
}
```

2. 在 `createContentGenerator` 函数中添加处理逻辑：

```typescript
if (config.authType === AuthType.USE_GPT_OPENAPI) {
  const gptOpenApiConfig: OpenAIModelConfig = {
    ...config,
    baseUrl: config.baseUrl || 'https://api.openai.com/v1',
  };
  return new OpenAIContentGenerator(gptOpenApiConfig);
}
```

## 已支持的模型

### 1. 方舟模型 (Ark)

- **文件**: `ark.ts`
- **认证类型**: `USE_ARK`
- **环境变量**: `ARK_API_KEY`, `ARK_MODEL`
- **默认BaseURL**: `https://ark-cn-beijing.bytedance.net/api/v3`

### 2. GPT OpenAPI模型 (GPT OpenAPI)

- **文件**: `gpt_openapi.ts`
- **认证类型**: `USE_GPT_OPENAPI`
- **环境变量**: `GPT_OPENAPI_API_KEY`, `GPT_OPENAPI_MODEL`
- **默认BaseURL**: `https://api.openai.com/v1`
- **默认模型**: `gcp-claude4-sonnet`
- **支持的模型**: 所有OpenAPI兼容的GPT模型

## 设计原则

1. **统一接口**: 所有适配器都实现相同的 `ContentGenerator` 接口
2. **类型安全**: 使用TypeScript确保类型安全
3. **错误处理**: 统一的错误处理和日志记录
4. **可扩展性**: 易于添加新的模型适配器
5. **配置灵活**: 支持环境变量和运行时配置

## 注意事项

1. **API格式转换**: 不同模型的API格式可能不同，需要在适配器中进行转换
2. **功能支持**: 不是所有模型都支持所有功能（如嵌入、流式等），需要适当处理
3. **错误处理**: 使用 `handleHttpError` 方法统一处理错误
4. **配置验证**: 在构造函数中验证必需的配置项
5. **文档更新**: 添加新适配器时记得更新此README文档
