/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import * as path from 'path';
import { glob } from 'glob';
import { getCurrentGeminiMdFilename } from './memoryTool.js';
import {
  detectFileType,
  processSingleFileContent,
  DEFAULT_ENCODING,
  getSpecificMimeType,
} from '../utils/fileUtils.js';
import { PartListUnion } from '@google/genai';
import { Config } from '../config/config.js';
import {
  recordFileOperationMetric,
  FileOperation,
} from '../telemetry/metrics.js';

/**
 * Parameters for the ReadManyFilesTool.
 */
export interface ReadManyFilesParams {
  /**
   * An array of file paths or directory paths to search within.
   * Paths are relative to the tool's configured target directory.
   * Glob patterns can be used directly in these paths.
   */
  paths: string[];

  /**
   * Optional. Glob patterns for files to include.
   * These are effectively combined with the `paths`.
   * Example: ["*.ts", "src/** /*.md"]
   */
  include?: string[];

  /**
   * Optional. Glob patterns for files/directories to exclude.
   * Applied as ignore patterns.
   * Example: ["*.log", "dist/**"]
   */
  exclude?: string[];

  /**
   * Optional. Search directories recursively.
   * This is generally controlled by glob patterns (e.g., `**`).
   * The glob implementation is recursive by default for `**`.
   * For simplicity, we'll rely on `**` for recursion.
   */
  recursive?: boolean;

  /**
   * Optional. Apply default exclusion patterns. Defaults to true.
   */
  useDefaultExcludes?: boolean;

  /**
   * Optional. Whether to respect .gitignore patterns. Defaults to true.
   */
  respect_git_ignore?: boolean;
}

/**
 * Default exclusion patterns for commonly ignored directories and binary file types.
 * These are compatible with glob ignore patterns.
 * TODO(adh): Consider making this configurable or extendable through a command line arguement.
 * TODO(adh): Look into sharing this list with the glob tool.
 */
const DEFAULT_EXCLUDES: string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.vscode/**',
  '**/.idea/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/__pycache__/**',
  '**/*.pyc',
  '**/*.pyo',
  '**/*.bin',
  '**/*.exe',
  '**/*.dll',
  '**/*.so',
  '**/*.dylib',
  '**/*.class',
  '**/*.jar',
  '**/*.war',
  '**/*.zip',
  '**/*.tar',
  '**/*.gz',
  '**/*.bz2',
  '**/*.rar',
  '**/*.7z',
  '**/*.doc',
  '**/*.docx',
  '**/*.xls',
  '**/*.xlsx',
  '**/*.ppt',
  '**/*.pptx',
  '**/*.odt',
  '**/*.ods',
  '**/*.odp',
  '**/*.DS_Store',
  '**/.env',
  `**/${getCurrentGeminiMdFilename()}`,
];

const DEFAULT_OUTPUT_SEPARATOR_FORMAT = '--- {filePath} ---';

/**
 * Tool implementation for finding and reading multiple text files from the local filesystem
 * within a specified target directory. The content is concatenated.
 * It is intended to run in an environment with access to the local file system (e.g., a Node.js backend).
 */
export class ReadManyFilesTool extends BaseTool<
  ReadManyFilesParams,
  ToolResult
> {
  static readonly Name: string = 'read_many_files';
  private readonly geminiIgnorePatterns: string[] = [];

  /**
   * Creates an instance of ReadManyFilesTool.
   * @param targetDir The absolute root directory within which this tool is allowed to operate.
   * All paths provided in `params` will be resolved relative to this directory.
   */
  constructor(
    readonly targetDir: string,
    private config: Config,
  ) {
    const parameterSchema: Record<string, unknown> = {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description:
            "Required. An array of glob patterns or paths relative to the tool's target directory. Examples: ['src/**/*.ts'], ['README.md', 'docs/']",
        },
        include: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional. Additional glob patterns to include. These are merged with `paths`. Example: ["*.test.ts"] to specifically add test files if they were broadly excluded.',
          default: [],
        },
        exclude: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional. Glob patterns for files/directories to exclude. Added to default excludes if useDefaultExcludes is true. Example: ["**/*.log", "temp/"]',
          default: [],
        },
        recursive: {
          type: 'boolean',
          description:
            'Optional. Whether to search recursively (primarily controlled by `**` in glob patterns). Defaults to true.',
          default: true,
        },
        useDefaultExcludes: {
          type: 'boolean',
          description:
            'Optional. Whether to apply a list of default exclusion patterns (e.g., node_modules, .git, binary files). Defaults to true.',
          default: true,
        },
        respect_git_ignore: {
          type: 'boolean',
          description:
            'Optional. Whether to respect .gitignore patterns when discovering files. Only available in git repositories. Defaults to true.',
          default: true,
        },
      },
      required: ['paths'],
    };

    super(
      ReadManyFilesTool.Name,
      'ReadManyFiles',
      `Reads content from multiple files specified by paths or glob patterns within a configured target directory. For text files, it concatenates their content into a single string. It is primarily designed for text-based files. However, it can also process image (e.g., .png, .jpg) and PDF (.pdf) files if their file names or extensions are explicitly included in the 'paths' argument. For these explicitly requested non-text files, their data is read and included in a format suitable for model consumption (e.g., base64 encoded).

This tool is useful when you need to understand or analyze a collection of files, such as:
- Getting an overview of a codebase or parts of it (e.g., all TypeScript files in the 'src' directory).
- Finding where specific functionality is implemented if the user asks broad questions about code.
- Reviewing documentation files (e.g., all Markdown files in the 'docs' directory).
- Gathering context from multiple configuration files.
- When the user asks to "read all files in X directory" or "show me the content of all Y files".

Use this tool when the user's query implies needing the content of several files simultaneously for context, analysis, or summarization. For text files, it uses default UTF-8 encoding and a '--- {filePath} ---' separator between file contents. Ensure paths are relative to the target directory. Glob patterns like 'src/**/*.js' are supported. Avoid using for single files if a more specific single-file reading tool is available, unless the user specifically requests to process a list containing just one file via this tool. Other binary files (not explicitly requested as image/PDF) are generally skipped. Default excludes apply to common non-text files (except for explicitly requested images/PDFs) and large dependency directories unless 'useDefaultExcludes' is false.`,
      parameterSchema,
    );
    this.targetDir = path.resolve(targetDir);
    this.geminiIgnorePatterns = config
      .getFileService()
      .getGeminiIgnorePatterns();
  }

  validateParams(params: ReadManyFilesParams): string | null {
    if (
      !params.paths ||
      !Array.isArray(params.paths) ||
      params.paths.length === 0
    ) {
      return 'The "paths" parameter is required and must be a non-empty array of strings/glob patterns.';
    }
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      if (
        !params.paths ||
        !Array.isArray(params.paths) ||
        params.paths.length === 0
      ) {
        return 'The "paths" parameter is required and must be a non-empty array of strings/glob patterns.';
      }
      return 'Parameters failed schema validation. Ensure "paths" is a non-empty array and other parameters match their expected types.';
    }
    for (const p of params.paths) {
      if (typeof p !== 'string' || p.trim() === '') {
        return 'Each item in "paths" must be a non-empty string/glob pattern.';
      }
    }
    if (
      params.include &&
      (!Array.isArray(params.include) ||
        !params.include.every((item) => typeof item === 'string'))
    ) {
      return 'If provided, "include" must be an array of strings/glob patterns.';
    }
    if (
      params.exclude &&
      (!Array.isArray(params.exclude) ||
        !params.exclude.every((item) => typeof item === 'string'))
    ) {
      return 'If provided, "exclude" must be an array of strings/glob patterns.';
    }
    return null;
  }

  getDescription(params: ReadManyFilesParams): string {
    const allPatterns = [...params.paths, ...(params.include || [])];
    const pathDesc = `使用模式：\`${allPatterns.join('`, `')}\`（目标目录：\`${this.targetDir}\`）`;

    // Determine the final list of exclusion patterns exactly as in execute method
    const paramExcludes = params.exclude || [];
    const paramUseDefaultExcludes = params.useDefaultExcludes !== false;

    const finalExclusionPatternsForDescription: string[] =
      paramUseDefaultExcludes
        ? [...DEFAULT_EXCLUDES, ...paramExcludes, ...this.geminiIgnorePatterns]
        : [...paramExcludes, ...this.geminiIgnorePatterns];

    let excludeDesc = `排除规则：${finalExclusionPatternsForDescription.length > 0 ? `如 \`${finalExclusionPatternsForDescription.slice(0, 2).join('`, `')}${finalExclusionPatternsForDescription.length > 2 ? '...`' : '`'} 等模式` : '无特定规则'}`;

    // Add a note if .geminiignore patterns contributed to the final list of exclusions
    if (this.geminiIgnorePatterns.length > 0) {
      const geminiPatternsInEffect = this.geminiIgnorePatterns.filter((p) =>
        finalExclusionPatternsForDescription.includes(p),
      ).length;
      if (geminiPatternsInEffect > 0) {
        excludeDesc += `（包含 ${geminiPatternsInEffect} 个来自 .geminiignore 的规则）`;
      }
    }

    return `将尝试读取并合并文件 ${pathDesc}。${excludeDesc}。文件编码：${DEFAULT_ENCODING}。分隔符："${DEFAULT_OUTPUT_SEPARATOR_FORMAT.replace('{filePath}', 'path/to/file.ext')}"。`;
  }

  async execute(
    params: ReadManyFilesParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters for ${this.displayName}. Reason: ${validationError}`,
        returnDisplay: `## 参数错误\n\n${validationError}`,
      };
    }

    const {
      paths: inputPatterns,
      include = [],
      exclude = [],
      useDefaultExcludes = true,
      respect_git_ignore = true,
    } = params;

    const respectGitIgnore =
      respect_git_ignore ?? this.config.getFileFilteringRespectGitIgnore();

    // Get centralized file discovery service
    const fileDiscovery = this.config.getFileService();

    const toolBaseDir = this.targetDir;
    const filesToConsider = new Set<string>();
    const skippedFiles: Array<{ path: string; reason: string }> = [];
    const processedFilesRelativePaths: string[] = [];
    const contentParts: PartListUnion = [];

    const effectiveExcludes = useDefaultExcludes
      ? [...DEFAULT_EXCLUDES, ...exclude, ...this.geminiIgnorePatterns]
      : [...exclude, ...this.geminiIgnorePatterns];

    const searchPatterns = [...inputPatterns, ...include];
    if (searchPatterns.length === 0) {
      return {
        llmContent: 'No search paths or include patterns provided.',
        returnDisplay: `## 提示信息\n\n未指定搜索路径或包含模式，没有需要读取或合并的内容。`,
      };
    }

    try {
      const entries = await glob(searchPatterns, {
        cwd: toolBaseDir,
        ignore: effectiveExcludes,
        nodir: true,
        dot: true,
        absolute: true,
        nocase: true,
        signal,
      });

      const filteredEntries = respectGitIgnore
        ? fileDiscovery
            .filterFiles(
              entries.map((p) => path.relative(toolBaseDir, p)),
              {
                respectGitIgnore,
              },
            )
            .map((p) => path.resolve(toolBaseDir, p))
        : entries;

      let gitIgnoredCount = 0;
      for (const absoluteFilePath of entries) {
        // Security check: ensure the glob library didn't return something outside targetDir.
        if (!absoluteFilePath.startsWith(toolBaseDir)) {
          skippedFiles.push({
            path: absoluteFilePath,
            reason: `安全检查：Glob 库返回的路径超出目标目录范围。基础目录：${toolBaseDir}，文件路径：${absoluteFilePath}`,
          });
          continue;
        }

        // Check if this file was filtered out by git ignore
        if (respectGitIgnore && !filteredEntries.includes(absoluteFilePath)) {
          gitIgnoredCount++;
          continue;
        }

        filesToConsider.add(absoluteFilePath);
      }

      // Add info about git-ignored files if any were filtered
      if (gitIgnoredCount > 0) {
        skippedFiles.push({
          path: `${gitIgnoredCount} 个文件`,
          reason: '被git忽略',
        });
      }
    } catch (error) {
      return {
        llmContent: `Error during file search: ${getErrorMessage(error)}`,
        returnDisplay: `## 文件搜索错误\n\n搜索文件时发生错误：\n\`\`\`\n${getErrorMessage(error)}\n\`\`\``,
      };
    }

    const sortedFiles = Array.from(filesToConsider).sort();

    for (const filePath of sortedFiles) {
      const relativePathForDisplay = path
        .relative(toolBaseDir, filePath)
        .replace(/\\/g, '/');

      const fileType = detectFileType(filePath);

      if (fileType === 'image' || fileType === 'pdf') {
        const fileExtension = path.extname(filePath).toLowerCase();
        const fileNameWithoutExtension = path.basename(filePath, fileExtension);
        const requestedExplicitly = inputPatterns.some(
          (pattern: string) =>
            pattern.toLowerCase().includes(fileExtension) ||
            pattern.includes(fileNameWithoutExtension),
        );

        if (!requestedExplicitly) {
          skippedFiles.push({
            path: relativePathForDisplay,
            reason: '资源文件（图片/PDF）未被明确按名称或扩展名请求',
          });
          continue;
        }
      }

      // Use processSingleFileContent for all file types now
      const fileReadResult = await processSingleFileContent(
        filePath,
        toolBaseDir,
      );

      if (fileReadResult.error) {
        skippedFiles.push({
          path: relativePathForDisplay,
          reason: `读取错误：${fileReadResult.error}`,
        });
      } else {
        if (typeof fileReadResult.llmContent === 'string') {
          const separator = DEFAULT_OUTPUT_SEPARATOR_FORMAT.replace(
            '{filePath}',
            relativePathForDisplay,
          );
          contentParts.push(`${separator}\n\n${fileReadResult.llmContent}\n\n`);
        } else {
          contentParts.push(fileReadResult.llmContent); // This is a Part for image/pdf
        }
        processedFilesRelativePaths.push(relativePathForDisplay);
        const lines =
          typeof fileReadResult.llmContent === 'string'
            ? fileReadResult.llmContent.split('\n').length
            : undefined;
        const mimetype = getSpecificMimeType(filePath);
        recordFileOperationMetric(
          this.config,
          FileOperation.READ,
          lines,
          mimetype,
          path.extname(filePath),
        );
      }
    }

    let displayMessage = `### 批量读取文件结果（目标目录：\`${this.targetDir}\`）\n\n`;
    if (processedFilesRelativePaths.length > 0) {
      displayMessage += `成功读取并合并了 **${processedFilesRelativePaths.length} 个文件** 的内容。\n`;
      if (processedFilesRelativePaths.length <= 10) {
        displayMessage += `\n**已处理的文件：**\n`;
        processedFilesRelativePaths.forEach(
          (p) => (displayMessage += `- \`${p}\`\n`),
        );
      } else {
        displayMessage += `\n**已处理的文件（显示前10个）：**\n`;
        processedFilesRelativePaths
          .slice(0, 10)
          .forEach((p) => (displayMessage += `- \`${p}\`\n`));
        displayMessage += `- ...还有 ${processedFilesRelativePaths.length - 10} 个文件。\n`;
      }
    }

    if (skippedFiles.length > 0) {
      if (processedFilesRelativePaths.length === 0) {
        displayMessage += `根据指定条件，没有文件被读取和合并。\n`;
      }
      if (skippedFiles.length <= 5) {
        displayMessage += `\n**跳过了 ${skippedFiles.length} 个项目：**\n`;
      } else {
        displayMessage += `\n**跳过了 ${skippedFiles.length} 个项目（显示前5个）：**\n`;
      }
      skippedFiles
        .slice(0, 5)
        .forEach(
          (f) => (displayMessage += `- \`${f.path}\`（原因：${f.reason}）\n`),
        );
      if (skippedFiles.length > 5) {
        displayMessage += `- ...还有 ${skippedFiles.length - 5} 个项目。\n`;
      }
    } else if (
      processedFilesRelativePaths.length === 0 &&
      skippedFiles.length === 0
    ) {
      displayMessage += `根据指定条件，没有文件被读取和合并。\n`;
    }

    if (contentParts.length === 0) {
      contentParts.push(
        'No files matching the criteria were found or all were skipped.',
      );
    }
    return {
      llmContent: contentParts,
      returnDisplay: displayMessage.trim(),
    };
  }
}
