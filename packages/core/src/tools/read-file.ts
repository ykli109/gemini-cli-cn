/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { BaseTool, ToolResult } from './tools.js';
import { isWithinRoot, processSingleFileContent } from '../utils/fileUtils.js';
import { Config } from '../config/config.js';
import { getSpecificMimeType } from '../utils/fileUtils.js';
import {
  recordFileOperationMetric,
  FileOperation,
} from '../telemetry/metrics.js';

/**
 * Parameters for the ReadFile tool
 */
export interface ReadFileToolParams {
  /**
   * The absolute path to the file to read
   */
  absolute_path: string;

  /**
   * The line number to start reading from (optional)
   */
  offset?: number;

  /**
   * The number of lines to read (optional)
   */
  limit?: number;
}

/**
 * Implementation of the ReadFile tool logic
 */
export class ReadFileTool extends BaseTool<ReadFileToolParams, ToolResult> {
  static readonly Name: string = 'read_file';

  constructor(
    private rootDirectory: string,
    private config: Config,
  ) {
    super(
      ReadFileTool.Name,
      '读取文件',
      '从本地文件系统读取并返回指定文件的内容。支持文本、图像（PNG、JPG、GIF、WEBP、SVG、BMP）和 PDF 文件。对于文本文件，可以读取特定行范围。',
      {
        properties: {
          absolute_path: {
            description:
              "要读取的文件的绝对路径（例如，'/home/user/project/file.txt'）。不支持相对路径。您必须提供绝对路径。",
            type: 'string',
            pattern: '^/',
          },
          offset: {
            description:
              "可选：对于文本文件，从第几行开始读取（从0开始计数）。需要设置 'limit' 参数。用于分页读取大文件。",
            type: 'number',
          },
          limit: {
            description:
              "可选：对于文本文件，要读取的最大行数。与 'offset' 一起使用来分页读取大文件。如果省略，则读取整个文件（如果可行，最多到默认限制）。",
            type: 'number',
          },
        },
        required: ['absolute_path'],
        type: 'object',
      },
    );
    this.rootDirectory = path.resolve(rootDirectory);
  }

  validateToolParams(params: ReadFileToolParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation.';
    }
    const filePath = params.absolute_path;
    if (!path.isAbsolute(filePath)) {
      return `File path must be absolute, but was relative: ${filePath}. You must provide an absolute path.`;
    }
    if (!isWithinRoot(filePath, this.rootDirectory)) {
      return `File path must be within the root directory (${this.rootDirectory}): ${filePath}`;
    }
    if (params.offset !== undefined && params.offset < 0) {
      return 'Offset must be a non-negative number';
    }
    if (params.limit !== undefined && params.limit <= 0) {
      return 'Limit must be a positive number';
    }

    const fileService = this.config.getFileService();
    if (fileService.shouldGeminiIgnoreFile(params.absolute_path)) {
      const relativePath = makeRelative(
        params.absolute_path,
        this.rootDirectory,
      );
      return `File path '${shortenPath(relativePath)}' is ignored by .geminiignore pattern(s).`;
    }

    return null;
  }

  getDescription(params: ReadFileToolParams): string {
    if (
      !params ||
      typeof params.absolute_path !== 'string' ||
      params.absolute_path.trim() === ''
    ) {
      return `Path unavailable`;
    }
    const relativePath = makeRelative(params.absolute_path, this.rootDirectory);
    return shortenPath(relativePath);
  }

  async execute(
    params: ReadFileToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `错误：${validationError}`,
      };
    }

    const result = await processSingleFileContent(
      params.absolute_path,
      this.rootDirectory,
      params.offset,
      params.limit,
    );

    if (result.error) {
      return {
        llmContent: result.error, // The detailed error for LLM
        returnDisplay: result.returnDisplay, // User-friendly error
      };
    }

    const lines =
      typeof result.llmContent === 'string'
        ? result.llmContent.split('\n').length
        : undefined;
    const mimetype = getSpecificMimeType(params.absolute_path);
    recordFileOperationMetric(
      this.config,
      FileOperation.READ,
      lines,
      mimetype,
      path.extname(params.absolute_path),
    );

    return {
      llmContent: result.llmContent,
      returnDisplay: result.returnDisplay,
    };
  }
}
