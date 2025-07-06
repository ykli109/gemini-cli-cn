/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { Colors } from '../colors.js';
import { type MCPServerConfig } from '@genius-ai/gemini-cli-core';

interface ContextSummaryDisplayProps {
  geminiMdFileCount: number;
  contextFileNames: string[];
  mcpServers?: Record<string, MCPServerConfig>;
  showToolDescriptions?: boolean;
}

export const ContextSummaryDisplay: React.FC<ContextSummaryDisplayProps> = ({
  geminiMdFileCount,
  contextFileNames,
  mcpServers,
  showToolDescriptions,
}) => {
  const mcpServerCount = Object.keys(mcpServers || {}).length;

  if (geminiMdFileCount === 0 && mcpServerCount === 0) {
    return <Text> </Text>; // Render an empty space to reserve height
  }

  const geminiMdText = (() => {
    if (geminiMdFileCount === 0) {
      return '';
    }
    const allNamesTheSame = new Set(contextFileNames).size < 2;
    const name = allNamesTheSame ? contextFileNames[0] : '上下文';
    return `${geminiMdFileCount} 个${name}文件${
      geminiMdFileCount > 1 ? '' : ''
    }`;
  })();

  const mcpText =
    mcpServerCount > 0
      ? `${mcpServerCount} 个MCP服务器${mcpServerCount > 1 ? '' : ''}`
      : '';

  let summaryText = '正在使用 ';
  if (geminiMdText) {
    summaryText += geminiMdText;
  }
  if (geminiMdText && mcpText) {
    summaryText += ' 和 ';
  }
  if (mcpText) {
    summaryText += mcpText;
    // Add ctrl+t hint when MCP servers are available
    if (mcpServers && Object.keys(mcpServers).length > 0) {
      if (showToolDescriptions) {
        summaryText += ' (ctrl+t 切换)';
      } else {
        summaryText += ' (ctrl+t 查看)';
      }
    }
  }

  return <Text color={Colors.Gray}>{summaryText}</Text>;
};
