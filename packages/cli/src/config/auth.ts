/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@google/gemini-cli-core';
import { loadEnvironment } from './config.js';

export const validateAuthMethod = (authMethod: string): string | null => {
  loadEnvironment();
  if (authMethod === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    return null;
  }

  if (authMethod === AuthType.USE_GEMINI) {
    if (!process.env.GEMINI_API_KEY) {
      return '未找到 GEMINI_API_KEY 环境变量。请将其添加到您的 .env 文件中并重试，无需重新加载！';
    }
    return null;
  }

  if (authMethod === AuthType.USE_VERTEX_AI) {
    const hasVertexProjectLocationConfig =
      !!process.env.GOOGLE_CLOUD_PROJECT && !!process.env.GOOGLE_CLOUD_LOCATION;
    const hasGoogleApiKey = !!process.env.GOOGLE_API_KEY;
    if (!hasVertexProjectLocationConfig && !hasGoogleApiKey) {
      return (
        '必须指定 GOOGLE_GENAI_USE_VERTEXAI=true 以及以下任一选项：\n' +
        '• GOOGLE_CLOUD_PROJECT 和 GOOGLE_CLOUD_LOCATION 环境变量。\n' +
        '• GOOGLE_API_KEY 环境变量（如果使用快速模式）。\n' +
        '请更新您的 .env 文件并重试，无需重新加载！'
      );
    }
    return null;
  }

  if (authMethod === AuthType.USE_ARK) {
    if (!process.env.ARK_API_KEY) {
      return '未找到 ARK_API_KEY 环境变量。请将其添加到您的 .env 文件中并重试，无需重新加载！';
    }
    return null;
  }

  if (authMethod === AuthType.USE_GPT_OPENAPI) {
    if (!process.env.GPT_OPENAPI_API_KEY) {
      return '未找到 GPT_OPENAPI_API_KEY 环境变量。请将其添加到您的 .env 文件中并重试，无需重新加载！';
    }
    return null;
  }

  return '选择的认证方式无效。';
};
