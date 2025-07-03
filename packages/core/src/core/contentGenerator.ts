/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { getEffectiveModel } from './modelCheck.js';
import { ContentGenerator, ArkContentGenerator, ArkModelConfig, GPTOpenApitContentGenerator, GPTOpenApitModelConfig } from '../generators/index.js';

// 重新导出 ContentGenerator 接口以保持向后兼容性
export { ContentGenerator };

export enum AuthType {
  LOGIN_WITH_GOOGLE_PERSONAL = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  USE_ARK = 'ark', // 方舟的模型可以用
  USE_GPT_OPENAPI = 'gpt-openapi', // GPT OpenAPI兼容的模型可以用
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
  baseUrl?: string;
  customHeaders?: Record<string, string>;
  timeout?: number;
};

export async function createContentGeneratorConfig(
  model: string | undefined,
  authType: AuthType | undefined,
  config?: { getModel?: () => string },
): Promise<ContentGeneratorConfig> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const googleApiKey = process.env.GOOGLE_API_KEY;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION;
  const arkApiKey = process.env.ARK_API_KEY;
  const arkModel = process.env.ARK_MODEL;
  const gptOpenApiKey = process.env.GPT_OPENAPI_API_KEY;
  const gptOpenApiModel = process.env.GPT_OPENAPI_MODEL;
  const customBaseUrl = process.env.CUSTOM_BASE_URL;


  // 根据认证类型选择合适的默认模型
  let effectiveModel: string;
  if (authType === AuthType.USE_ARK) {
    // 方舟模型优先使用传入的model参数，然后是环境变量ARK_MODEL
    effectiveModel = model || arkModel || '';
    // 确保是方舟模型格式
    if (!effectiveModel.startsWith('ep-')) {
      effectiveModel = '';
    }
  } else if (authType === AuthType.USE_GPT_OPENAPI) {
    // GPT OpenAPI模型优先使用传入的model参数，然后是环境变量GPT_OPENAPI_MODEL
    effectiveModel = model || gptOpenApiModel || 'gcp-claude4-sonnet';
  } else {
    // 其他认证类型使用原有逻辑
    effectiveModel = config?.getModel?.() || model || DEFAULT_GEMINI_MODEL;
  }

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
  };

  // if we are using google auth nothing else to validate for now
  if (authType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.model = await getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
    );

    return contentGeneratorConfig;
  }

  if (
    authType === AuthType.USE_VERTEX_AI &&
    !!googleApiKey &&
    googleCloudProject &&
    googleCloudLocation
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;
    contentGeneratorConfig.model = await getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
    );

    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_ARK && arkApiKey) {
    contentGeneratorConfig.apiKey = arkApiKey;
    contentGeneratorConfig.baseUrl = customBaseUrl;
    
    // 方舟模型必须明确指定模型名称
    let arkModelName = effectiveModel;
    if (!arkModelName) {
      // 尝试从ARK_MODEL环境变量获取
      arkModelName = arkModel || '';
    }
    
    if (!arkModelName) {
      throw new Error(
        '方舟模型需要明确指定模型名称。请通过以下方式之一指定模型：\n' +
        '1. 设置 ARK_MODEL 环境变量，例如：export ARK_MODEL="ep-20250627193526-wzbxz"\n' +
        '2. 使用 --model 命令行参数，例如：--model ep-20250627193526-wzbxz\n' +
        '3. 在设置文件中配置模型名称'
      );
    }
    
    contentGeneratorConfig.model = arkModelName;
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_GPT_OPENAPI && gptOpenApiKey) {
    contentGeneratorConfig.apiKey = gptOpenApiKey;
    contentGeneratorConfig.baseUrl = customBaseUrl;
    
    // GPT OpenAPI模型名称
    let gptOpenApiModelName = effectiveModel;
    if (!gptOpenApiModelName) {
      // 尝试从GPT_OPENAPI_MODEL环境变量获取
      gptOpenApiModelName = gptOpenApiModel || 'gcp-claude4-sonnet';
    }
    
    contentGeneratorConfig.model = gptOpenApiModelName;
    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}



export async function createContentGenerator(
  config: ContentGeneratorConfig,
): Promise<ContentGenerator> {
  const version = process.env.CLI_VERSION || process.version;
  const httpOptions = {
    headers: {
      'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };
  if (config.authType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    return createCodeAssistContentGenerator(httpOptions, config.authType);
  }

  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config.vertexai,
      httpOptions,
    });

    return googleGenAI.models;
  }

  if (config.authType === AuthType.USE_ARK) {
    // 确保 baseUrl 有值，如果没有则使用默认值
    const arkConfig: ArkModelConfig = {
      ...config,
      baseUrl: config.baseUrl || 'https://ark-cn-beijing.bytedance.net/api/v3',
    };
    return new ArkContentGenerator(arkConfig);
  }

  if (config.authType === AuthType.USE_GPT_OPENAPI) {
    // 确保 baseUrl 有值，如果没有则使用默认值
    const gptOpenApiConfig: GPTOpenApitModelConfig = {
      ...config,
      baseUrl: config.baseUrl || 'https://gpt-i18n.byteintl.net/gpt/openapi/online/v2',
    };
    return new GPTOpenApitContentGenerator(gptOpenApiConfig);
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
