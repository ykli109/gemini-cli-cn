/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

const memoryToolSchemaData = {
  name: 'save_memory',
  description:
    '将特定信息或事实保存到您的长期记忆中。当用户明确要求您记住某些内容时，或者当他们陈述一个清晰、简洁的事实，并且该事实对于您在未来的交互中提供更个性化和有效的帮助很重要时，请使用此工具。',
  parameters: {
    type: 'object',
    properties: {
      fact: {
        type: 'string',
        description:
          '要记住的特定事实或信息。应该是一个清晰、独立的陈述。',
      },
    },
    required: ['fact'],
  },
};

const memoryToolDescription = `
将特定信息或事实保存到您的长期记忆中。

使用此工具：

- 当用户明确要求您记住某些内容时（例如，"记住我喜欢披萨上的菠萝"，"请保存这个：我的猫叫 Whiskers"）。
- 当用户陈述一个关于他们自己、他们的偏好或他们的环境的清晰、简洁的事实，并且该事实对于您在未来的交互中提供更个性化和有效的帮助很重要时。

请勿使用此工具：

- 记住仅与当前会话相关的对话上下文。
- 保存冗长、复杂或杂乱的文本。事实应该相对简短和切中要点。
- 如果您不确定该信息是否值得长期记忆。如有疑问，您可以询问用户："我应该为您记住这个吗？"

## 参数

- \`fact\` (string, required): 要记住的特定事实或信息。这应该是一个清晰、独立的陈述。例如，如果用户说"我最喜欢的颜色是蓝色"，那么事实就是"我最喜欢的颜色是蓝色"。
`;

export const GEMINI_CONFIG_DIR = '.gemini';
export const DEFAULT_CONTEXT_FILENAME = 'GEMINI.md';
export const MEMORY_SECTION_HEADER = '## Gemini Added Memories';

// This variable will hold the currently configured filename for GEMINI.md context files.
// It defaults to DEFAULT_CONTEXT_FILENAME but can be overridden by setGeminiMdFilename.
let currentGeminiMdFilename: string | string[] = DEFAULT_CONTEXT_FILENAME;

export function setGeminiMdFilename(newFilename: string | string[]): void {
  if (Array.isArray(newFilename)) {
    if (newFilename.length > 0) {
      currentGeminiMdFilename = newFilename.map((name) => name.trim());
    }
  } else if (newFilename && newFilename.trim() !== '') {
    currentGeminiMdFilename = newFilename.trim();
  }
}

export function getCurrentGeminiMdFilename(): string {
  if (Array.isArray(currentGeminiMdFilename)) {
    return currentGeminiMdFilename[0];
  }
  return currentGeminiMdFilename;
}

export function getAllGeminiMdFilenames(): string[] {
  if (Array.isArray(currentGeminiMdFilename)) {
    return currentGeminiMdFilename;
  }
  return [currentGeminiMdFilename];
}

interface SaveMemoryParams {
  fact: string;
}

function getGlobalMemoryFilePath(): string {
  return path.join(homedir(), GEMINI_CONFIG_DIR, getCurrentGeminiMdFilename());
}

/**
 * Ensures proper newline separation before appending content.
 */
function ensureNewlineSeparation(currentContent: string): string {
  if (currentContent.length === 0) return '';
  if (currentContent.endsWith('\n\n') || currentContent.endsWith('\r\n\r\n'))
    return '';
  if (currentContent.endsWith('\n') || currentContent.endsWith('\r\n'))
    return '\n';
  return '\n\n';
}

export class MemoryTool extends BaseTool<SaveMemoryParams, ToolResult> {
  static readonly Name: string = memoryToolSchemaData.name;
  constructor() {
    super(
      MemoryTool.Name,
      '保存记忆',
      memoryToolDescription,
      memoryToolSchemaData.parameters as Record<string, unknown>,
    );
  }

  static async performAddMemoryEntry(
    text: string,
    memoryFilePath: string,
    fsAdapter: {
      readFile: (path: string, encoding: 'utf-8') => Promise<string>;
      writeFile: (
        path: string,
        data: string,
        encoding: 'utf-8',
      ) => Promise<void>;
      mkdir: (
        path: string,
        options: { recursive: boolean },
      ) => Promise<string | undefined>;
    },
  ): Promise<void> {
    let processedText = text.trim();
    // Remove leading hyphens and spaces that might be misinterpreted as markdown list items
    processedText = processedText.replace(/^(-+\s*)+/, '').trim();
    const newMemoryItem = `- ${processedText}`;

    try {
      await fsAdapter.mkdir(path.dirname(memoryFilePath), { recursive: true });
      let content = '';
      try {
        content = await fsAdapter.readFile(memoryFilePath, 'utf-8');
      } catch (_e) {
        // File doesn't exist, will be created with header and item.
      }

      const headerIndex = content.indexOf(MEMORY_SECTION_HEADER);

      if (headerIndex === -1) {
        // Header not found, append header and then the entry
        const separator = ensureNewlineSeparation(content);
        content += `${separator}${MEMORY_SECTION_HEADER}\n${newMemoryItem}\n`;
      } else {
        // Header found, find where to insert the new memory entry
        const startOfSectionContent =
          headerIndex + MEMORY_SECTION_HEADER.length;
        let endOfSectionIndex = content.indexOf('\n## ', startOfSectionContent);
        if (endOfSectionIndex === -1) {
          endOfSectionIndex = content.length; // End of file
        }

        const beforeSectionMarker = content
          .substring(0, startOfSectionContent)
          .trimEnd();
        let sectionContent = content
          .substring(startOfSectionContent, endOfSectionIndex)
          .trimEnd();
        const afterSectionMarker = content.substring(endOfSectionIndex);

        sectionContent += `\n${newMemoryItem}`;
        content =
          `${beforeSectionMarker}\n${sectionContent.trimStart()}\n${afterSectionMarker}`.trimEnd() +
          '\n';
      }
      await fsAdapter.writeFile(memoryFilePath, content, 'utf-8');
    } catch (error) {
      console.error(
        `[MemoryTool] Error adding memory entry to ${memoryFilePath}:`,
        error,
      );
      throw new Error(
        `[MemoryTool] Failed to add memory entry: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async execute(
    params: SaveMemoryParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    try {
      const { fact } = params;
      await MemoryTool.performAddMemoryEntry(fact, getGlobalMemoryFilePath(), {
        readFile: fs.readFile,
        writeFile: fs.writeFile,
        mkdir: fs.mkdir,
      });
      const successMessage = `好的，我已经记住了："${fact}"`;
      return {
        llmContent: JSON.stringify({ success: true, message: successMessage }),
        returnDisplay: successMessage,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[MemoryTool] Error executing save_memory for fact "${params.fact}": ${errorMessage}`,
      );
      return {
        llmContent: JSON.stringify({
          success: false,
          error: `Failed to save memory. Detail: ${errorMessage}`,
        }),
        returnDisplay: `保存记忆时出错：${errorMessage}`,
      };
    }
  }
}

