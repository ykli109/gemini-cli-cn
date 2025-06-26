/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as Diff from 'diff';
import {
  BaseTool,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolEditConfirmationDetails,
  ToolResult,
  ToolResultDisplay,
} from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { isNodeError } from '../utils/errors.js';
import { GeminiClient } from '../core/client.js';
import { Config, ApprovalMode } from '../config/config.js';
import { ensureCorrectEdit } from '../utils/editCorrector.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';
import { ReadFileTool } from './read-file.js';
import { ModifiableTool, ModifyContext } from './modifiable-tool.js';

/**
 * Parameters for the Edit tool
 */
export interface EditToolParams {
  /**
   * The absolute path to the file to modify
   */
  file_path: string;

  /**
   * The text to replace
   */
  old_string: string;

  /**
   * The text to replace it with
   */
  new_string: string;

  /**
   * Number of replacements expected. Defaults to 1 if not specified.
   * Use when you want to replace multiple occurrences.
   */
  expected_replacements?: number;
}

interface CalculatedEdit {
  currentContent: string | null;
  newContent: string;
  occurrences: number;
  error?: { display: string; raw: string };
  isNewFile: boolean;
}

/**
 * Implementation of the Edit tool logic
 */
export class EditTool
  extends BaseTool<EditToolParams, ToolResult>
  implements ModifiableTool<EditToolParams>
{
  static readonly Name = 'replace';
  private readonly config: Config;
  private readonly rootDirectory: string;
  private readonly client: GeminiClient;

  /**
   * Creates a new instance of the EditLogic
   * @param rootDirectory Root directory to ground this tool in.
   */
  constructor(config: Config) {
    super(
      EditTool.Name,
      '编辑',
      `替换文件中的文本。默认情况下替换单个匹配项，但当指定 \`expected_replacements\` 时可以替换多个匹配项。此工具需要在更改周围提供充分的上下文以确保精确定位。在尝试文本替换之前，始终使用 ${ReadFileTool.Name} 工具检查文件的当前内容。

必需参数的期望：
1. \`file_path\` 必须是绝对路径；否则将抛出错误。
2. \`old_string\` 必须是要替换的确切字面文本（包括所有空白、缩进、换行和周围代码等）。
3. \`new_string\` 必须是用来替换 \`old_string\` 的确切字面文本（也包括所有空白、缩进、换行和周围代码等）。确保结果代码是正确和惯用的。
4. 永远不要转义 \`old_string\` 或 \`new_string\`，这会破坏确切字面文本的要求。
**重要：** 如果上述任何一项不满足，工具将失败。对于 \`old_string\` 的关键要求：必须唯一标识要更改的单个实例。在目标文本的前后至少包含3行上下文，精确匹配空白和缩进。如果此字符串匹配多个位置，或不能精确匹配，工具将失败。
**多重替换：** 将 \`expected_replacements\` 设置为您要替换的匹配数量。工具将替换所有精确匹配 \`old_string\` 的匹配项。确保替换数量符合您的期望。`,
      {
        properties: {
          file_path: {
            description:
              "要修改的文件的绝对路径。必须以 '/' 开头。",
            type: 'string',
          },
          old_string: {
            description:
              '要替换的确切字面文本，优选不转义。对于单个替换（默认），在目标文本的前后至少包含3行上下文，精确匹配空白和缩进。对于多重替换，请指定 expected_replacements 参数。如果此字符串不是确切的字面文本（即您转义了它）或不能精确匹配，工具将失败。',
            type: 'string',
          },
          new_string: {
            description:
              '用来替换 `old_string` 的确切字面文本，优选不转义。提供确切的文本。确保结果代码是正确和惯用的。',
            type: 'string',
          },
          expected_replacements: {
            type: 'number',
            description:
              '期望的替换数量。如果未指定，默认为1。当您要替换多个匹配项时使用。',
            minimum: 1,
          },
        },
        required: ['file_path', 'old_string', 'new_string'],
        type: 'object',
      },
    );
    this.config = config;
    this.rootDirectory = path.resolve(this.config.getTargetDir());
    this.client = config.getGeminiClient();
  }

  /**
   * Checks if a path is within the root directory.
   * @param pathToCheck The absolute path to check.
   * @returns True if the path is within the root directory, false otherwise.
   */
  private isWithinRoot(pathToCheck: string): boolean {
    const normalizedPath = path.normalize(pathToCheck);
    const normalizedRoot = this.rootDirectory;
    const rootWithSep = normalizedRoot.endsWith(path.sep)
      ? normalizedRoot
      : normalizedRoot + path.sep;
    return (
      normalizedPath === normalizedRoot ||
      normalizedPath.startsWith(rootWithSep)
    );
  }

  /**
   * Validates the parameters for the Edit tool
   * @param params Parameters to validate
   * @returns Error message string or null if valid
   */
  validateToolParams(params: EditToolParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation.';
    }

    if (!path.isAbsolute(params.file_path)) {
      return `File path must be absolute: ${params.file_path}`;
    }

    if (!this.isWithinRoot(params.file_path)) {
      return `File path must be within the root directory (${this.rootDirectory}): ${params.file_path}`;
    }

    return null;
  }

  private _applyReplacement(
    currentContent: string | null,
    oldString: string,
    newString: string,
    isNewFile: boolean,
  ): string {
    if (isNewFile) {
      return newString;
    }
    if (currentContent === null) {
      // Should not happen if not a new file, but defensively return empty or newString if oldString is also empty
      return oldString === '' ? newString : '';
    }
    // If oldString is empty and it's not a new file, do not modify the content.
    if (oldString === '' && !isNewFile) {
      return currentContent;
    }
    return currentContent.replaceAll(oldString, newString);
  }

  /**
   * Calculates the potential outcome of an edit operation.
   * @param params Parameters for the edit operation
   * @returns An object describing the potential edit outcome
   * @throws File system errors if reading the file fails unexpectedly (e.g., permissions)
   */
  private async calculateEdit(
    params: EditToolParams,
    abortSignal: AbortSignal,
  ): Promise<CalculatedEdit> {
    const expectedReplacements = params.expected_replacements ?? 1;
    let currentContent: string | null = null;
    let fileExists = false;
    let isNewFile = false;
    let finalNewString = params.new_string;
    let finalOldString = params.old_string;
    let occurrences = 0;
    let error: { display: string; raw: string } | undefined = undefined;

    try {
      currentContent = fs.readFileSync(params.file_path, 'utf8');
      // Normalize line endings to LF for consistent processing.
      currentContent = currentContent.replace(/\r\n/g, '\n');
      fileExists = true;
    } catch (err: unknown) {
      if (!isNodeError(err) || err.code !== 'ENOENT') {
        // Rethrow unexpected FS errors (permissions, etc.)
        throw err;
      }
      fileExists = false;
    }

    if (params.old_string === '' && !fileExists) {
      // Creating a new file
      isNewFile = true;
    } else if (!fileExists) {
      // Trying to edit a non-existent file (and old_string is not empty)
      error = {
        display: `文件未找到。无法应用编辑。使用空的 old_string 创建新文件。`,
        raw: `File not found: ${params.file_path}`,
      };
    } else if (currentContent !== null) {
      // Editing an existing file
      const correctedEdit = await ensureCorrectEdit(
        currentContent,
        params,
        this.client,
        abortSignal,
      );
      finalOldString = correctedEdit.params.old_string;
      finalNewString = correctedEdit.params.new_string;
      occurrences = correctedEdit.occurrences;

      if (params.old_string === '') {
        // Error: Trying to create a file that already exists
        error = {
          display: `编辑失败。尝试创建已存在的文件。`,
          raw: `File already exists, cannot create: ${params.file_path}`,
        };
      } else if (occurrences === 0) {
        error = {
          display: `编辑失败，找不到要替换的字符串。`,
          raw: `Failed to edit, 0 occurrences found for old_string in ${params.file_path}. No edits made. The exact text in old_string was not found. Ensure you're not escaping content incorrectly and check whitespace, indentation, and context. Use ${ReadFileTool.Name} tool to verify.`,
        };
      } else if (occurrences !== expectedReplacements) {
        error = {
          display: `编辑失败，期望 ${expectedReplacements} 次匹配但找到 ${occurrences} 次。`,
          raw: `Failed to edit, Expected ${expectedReplacements} occurrences but found ${occurrences} for old_string in file: ${params.file_path}`,
        };
      }
    } else {
      // Should not happen if fileExists and no exception was thrown, but defensively:
      error = {
        display: `读取文件内容失败。`,
        raw: `Failed to read content of existing file: ${params.file_path}`,
      };
    }

    const newContent = this._applyReplacement(
      currentContent,
      finalOldString,
      finalNewString,
      isNewFile,
    );

    return {
      currentContent,
      newContent,
      occurrences,
      error,
      isNewFile,
    };
  }

  /**
   * Handles the confirmation prompt for the Edit tool in the CLI.
   * It needs to calculate the diff to show the user.
   */
  async shouldConfirmExecute(
    params: EditToolParams,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }
    const validationError = this.validateToolParams(params);
    if (validationError) {
      console.error(
        `[EditTool Wrapper] Attempted confirmation with invalid parameters: ${validationError}`,
      );
      return false;
    }

    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(params, abortSignal);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`Error preparing edit: ${errorMsg}`);
      return false;
    }

    if (editData.error) {
      console.log(`Error: ${editData.error.display}`);
      return false;
    }

    const fileName = path.basename(params.file_path);
    const fileDiff = Diff.createPatch(
      fileName,
      editData.currentContent ?? '',
      editData.newContent,
      'Current',
      'Proposed',
      DEFAULT_DIFF_OPTIONS,
    );
    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title: `确认编辑：${shortenPath(makeRelative(params.file_path, this.rootDirectory))}`,
      fileName,
      fileDiff,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }
      },
    };
    return confirmationDetails;
  }

  getDescription(params: EditToolParams): string {
    if (!params.file_path || !params.old_string || !params.new_string) {
      return `模型未提供编辑工具的有效参数`;
    }
    const relativePath = makeRelative(params.file_path, this.rootDirectory);
    if (params.old_string === '') {
      return `创建 ${shortenPath(relativePath)}`;
    }

    const oldStringSnippet =
      params.old_string.split('\n')[0].substring(0, 30) +
      (params.old_string.length > 30 ? '...' : '');
    const newStringSnippet =
      params.new_string.split('\n')[0].substring(0, 30) +
      (params.new_string.length > 30 ? '...' : '');

    if (params.old_string === params.new_string) {
      return `${shortenPath(relativePath)} 无文件更改`;
    }
    return `${shortenPath(relativePath)}：${oldStringSnippet} => ${newStringSnippet}`;
  }

  /**
   * Executes the edit operation with the given parameters.
   * @param params Parameters for the edit operation
   * @returns Result of the edit operation
   */
  async execute(
    params: EditToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `错误：${validationError}`,
      };
    }

    let editData: CalculatedEdit;
    try {
      editData = await this.calculateEdit(params, signal);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error preparing edit: ${errorMsg}`,
        returnDisplay: `编辑准备错误：${errorMsg}`,
      };
    }

    if (editData.error) {
      return {
        llmContent: editData.error.raw,
        returnDisplay: `错误：${editData.error.display}`,
      };
    }

    try {
      this.ensureParentDirectoriesExist(params.file_path);
      fs.writeFileSync(params.file_path, editData.newContent, 'utf8');

      let displayResult: ToolResultDisplay;
      if (editData.isNewFile) {
        displayResult = `已创建 ${shortenPath(makeRelative(params.file_path, this.rootDirectory))}`;
      } else {
        // Generate diff for display, even though core logic doesn't technically need it
        // The CLI wrapper will use this part of the ToolResult
        const fileName = path.basename(params.file_path);
        const fileDiff = Diff.createPatch(
          fileName,
          editData.currentContent ?? '', // Should not be null here if not isNewFile
          editData.newContent,
          'Current',
          'Proposed',
          DEFAULT_DIFF_OPTIONS,
        );
        displayResult = { fileDiff, fileName };
      }

      const llmSuccessMessage = editData.isNewFile
        ? `Created new file: ${params.file_path} with provided content.`
        : `Successfully modified file: ${params.file_path} (${editData.occurrences} replacements).`;

      return {
        llmContent: llmSuccessMessage,
        returnDisplay: displayResult,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error executing edit: ${errorMsg}`,
        returnDisplay: `文件写入错误：${errorMsg}`,
      };
    }
  }

  /**
   * Creates parent directories if they don't exist
   */
  private ensureParentDirectoriesExist(filePath: string): void {
    const dirName = path.dirname(filePath);
    if (!fs.existsSync(dirName)) {
      fs.mkdirSync(dirName, { recursive: true });
    }
  }

  getModifyContext(_: AbortSignal): ModifyContext<EditToolParams> {
    return {
      getFilePath: (params: EditToolParams) => params.file_path,
      getCurrentContent: async (params: EditToolParams): Promise<string> => {
        try {
          return fs.readFileSync(params.file_path, 'utf8');
        } catch (err) {
          if (!isNodeError(err) || err.code !== 'ENOENT') throw err;
          return '';
        }
      },
      getProposedContent: async (params: EditToolParams): Promise<string> => {
        try {
          const currentContent = fs.readFileSync(params.file_path, 'utf8');
          return this._applyReplacement(
            currentContent,
            params.old_string,
            params.new_string,
            params.old_string === '' && currentContent === '',
          );
        } catch (err) {
          if (!isNodeError(err) || err.code !== 'ENOENT') throw err;
          return '';
        }
      },
      createUpdatedParams: (
        oldContent: string,
        modifiedProposedContent: string,
        originalParams: EditToolParams,
      ): EditToolParams => ({
        ...originalParams,
        old_string: oldContent,
        new_string: modifiedProposedContent,
      }),
    };
  }
}
