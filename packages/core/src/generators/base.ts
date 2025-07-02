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