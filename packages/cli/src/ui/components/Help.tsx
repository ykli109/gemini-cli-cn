/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { SlashCommand } from '../hooks/slashCommandProcessor.js';

interface Help {
  commands: SlashCommand[];
}

export const Help: React.FC<Help> = ({ commands }) => (
  <Box
    flexDirection="column"
    marginBottom={1}
    borderColor={Colors.Gray}
    borderStyle="round"
    padding={1}
  >
    {/* Basics */}
    <Text bold color={Colors.Foreground}>
      基础操作：
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        添加上下文
      </Text>
      ：使用{' '}
      <Text bold color={Colors.AccentPurple}>
        @
      </Text>{' '}
      指定上下文文件（例如，{' '}
      <Text bold color={Colors.AccentPurple}>
        @src/myFile.ts
      </Text>
      ）来针对特定的文件或文件夹。
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        Shell 模式
      </Text>
      ：通过{' '}
      <Text bold color={Colors.AccentPurple}>
        !
      </Text>{' '}
      执行 shell 命令（例如，{' '}
      <Text bold color={Colors.AccentPurple}>
        !npm run start
      </Text>
      ）或使用自然语言（例如{' '}
      <Text bold color={Colors.AccentPurple}>
        启动服务器
      </Text>
      ）。
    </Text>

    <Box height={1} />

    {/* Commands */}
    <Text bold color={Colors.Foreground}>
      命令：
    </Text>
    {commands
      .filter((command) => command.description)
      .map((command: SlashCommand) => (
        <Text key={command.name} color={Colors.Foreground}>
          <Text bold color={Colors.AccentPurple}>
            {' '}
            /{command.name}
          </Text>
          {command.description && ' - ' + command.description}
        </Text>
      ))}
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        {' '}
        !{' '}
      </Text>
      - shell 命令
    </Text>

    <Box height={1} />

    {/* Shortcuts */}
    <Text bold color={Colors.Foreground}>
      键盘快捷键：
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        Enter
      </Text>{' '}
      - 发送消息
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        Shift+Enter
      </Text>{' '}
      - 换行
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        Up/Down
      </Text>{' '}
      - 循环浏览您的提示历史
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        Alt+Left/Right
      </Text>{' '}
      - 在输入中跳跃单词
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        Esc
      </Text>{' '}
      - 取消操作
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        Ctrl+C
      </Text>{' '}
      - 退出应用程序
    </Text>
  </Box>
);
