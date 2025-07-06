/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Text, Box, useInput } from 'ink';
import { Colors } from '../colors.js';
import { SuggestionsDisplay } from './SuggestionsDisplay.js';
import { useInputHistory } from '../hooks/useInputHistory.js';
import { TextBuffer } from './shared/text-buffer.js';
import { cpSlice, cpLen } from '../utils/textUtils.js';
import chalk from 'chalk';
import stringWidth from 'string-width';
import process from 'node:process';
import { useShellHistory } from '../hooks/useShellHistory.js';
import { useCompletion } from '../hooks/useCompletion.js';
import { isAtCommand, isSlashCommand } from '../utils/commandUtils.js';
import { SlashCommand } from '../hooks/slashCommandProcessor.js';
import { Config } from '@genius-ai/gemini-cli-core';

export interface InputPromptProps {
  buffer: TextBuffer;
  onSubmit: (value: string) => void;
  userMessages: readonly string[];
  onClearScreen: () => void;
  config: Config; // Added config for useCompletion
  slashCommands: SlashCommand[]; // Added slashCommands for useCompletion
  placeholder?: string;
  focus?: boolean;
  inputWidth: number;
  suggestionsWidth: number;
  shellModeActive: boolean;
  setShellModeActive: (value: boolean) => void;
}

export const InputPrompt: React.FC<InputPromptProps> = ({
  buffer,
  onSubmit,
  userMessages,
  onClearScreen,
  config,
  slashCommands,
  placeholder = '  输入您的消息或 @path/to/file',
  focus = true,
  inputWidth,
  suggestionsWidth,
  shellModeActive,
  setShellModeActive,
}) => {
  const [justNavigatedHistory, setJustNavigatedHistory] = useState(false);

  const completion = useCompletion(
    buffer.text,
    config.getTargetDir(),
    isAtCommand(buffer.text) || isSlashCommand(buffer.text),
    slashCommands,
    config,
  );

  const resetCompletionState = completion.resetCompletionState;
  const shellHistory = useShellHistory(config.getProjectRoot());

  const handleSubmitAndClear = useCallback(
    (submittedValue: string) => {
      if (shellModeActive) {
        shellHistory.addCommandToHistory(submittedValue);
      }
      // Clear the buffer *before* calling onSubmit to prevent potential re-submission
      // if onSubmit triggers a re-render while the buffer still holds the old value.
      buffer.setText('');
      onSubmit(submittedValue);
      resetCompletionState();
    },
    [onSubmit, buffer, resetCompletionState, shellModeActive, shellHistory],
  );

  const customSetTextAndResetCompletionSignal = useCallback(
    (newText: string) => {
      buffer.setText(newText);
      setJustNavigatedHistory(true);
    },
    [buffer, setJustNavigatedHistory],
  );

  const inputHistory = useInputHistory({
    userMessages,
    onSubmit: handleSubmitAndClear,
    isActive: !completion.showSuggestions && !shellModeActive,
    currentQuery: buffer.text,
    onChange: customSetTextAndResetCompletionSignal,
  });

  // Effect to reset completion if history navigation just occurred and set the text
  useEffect(() => {
    if (justNavigatedHistory) {
      resetCompletionState();
      setJustNavigatedHistory(false);
    }
  }, [
    justNavigatedHistory,
    buffer.text,
    resetCompletionState,
    setJustNavigatedHistory,
  ]);

  const completionSuggestions = completion.suggestions;
  const handleAutocomplete = useCallback(
    (indexToUse: number) => {
      if (indexToUse < 0 || indexToUse >= completionSuggestions.length) {
        return;
      }
      const query = buffer.text;
      const selectedSuggestion = completionSuggestions[indexToUse];

      if (query.trimStart().startsWith('/')) {
        const parts = query.trimStart().substring(1).split(' ');
        const commandName = parts[0];
        const slashIndex = query.indexOf('/');
        const base = query.substring(0, slashIndex + 1);

        const command = slashCommands.find((cmd) => cmd.name === commandName);
        if (command && command.completion) {
          const newValue = `${base}${commandName} ${selectedSuggestion.value}`;
          buffer.setText(newValue);
        } else {
          const newValue = base + selectedSuggestion.value;
          buffer.setText(newValue);
          handleSubmitAndClear(newValue);
        }
      } else {
        const atIndex = query.lastIndexOf('@');
        if (atIndex === -1) return;
        const pathPart = query.substring(atIndex + 1);
        const lastSlashIndexInPath = pathPart.lastIndexOf('/');
        let autoCompleteStartIndex = atIndex + 1;
        if (lastSlashIndexInPath !== -1) {
          autoCompleteStartIndex += lastSlashIndexInPath + 1;
        }
        buffer.replaceRangeByOffset(
          autoCompleteStartIndex,
          buffer.text.length,
          selectedSuggestion.value,
        );
      }
      resetCompletionState();
    },
    [
      resetCompletionState,
      handleSubmitAndClear,
      buffer,
      completionSuggestions,
      slashCommands,
    ],
  );

  useInput(
    (input, key) => {
      if (!focus) {
        return;
      }
      const query = buffer.text;

      if (input === '!' && query === '' && !completion.showSuggestions) {
        setShellModeActive(!shellModeActive);
        buffer.setText(''); // Clear the '!' from input
        return true;
      }

      if (completion.showSuggestions) {
        if (key.upArrow) {
          completion.navigateUp();
          return;
        }
        if (key.downArrow) {
          completion.navigateDown();
          return;
        }
        if (key.tab) {
          if (completion.suggestions.length > 0) {
            const targetIndex =
              completion.activeSuggestionIndex === -1
                ? 0
                : completion.activeSuggestionIndex;
            if (targetIndex < completion.suggestions.length) {
              handleAutocomplete(targetIndex);
            }
          }
          return;
        }
        if (key.return) {
          if (completion.activeSuggestionIndex >= 0) {
            handleAutocomplete(completion.activeSuggestionIndex);
          } else if (query.trim()) {
            handleSubmitAndClear(query);
          }
          return;
        }
      } else {
        // Keybindings when suggestions are not shown
        if (key.ctrl && input === 'l') {
          onClearScreen();
          return true;
        }
        if (key.ctrl && input === 'p') {
          inputHistory.navigateUp();
          return true;
        }
        if (key.ctrl && input === 'n') {
          inputHistory.navigateDown();
          return true;
        }
        if (key.escape) {
          if (shellModeActive) {
            setShellModeActive(false);
            return;
          }
          completion.resetCompletionState();
          return;
        }
      }

      // Ctrl+A (Home)
      if (key.ctrl && input === 'a') {
        buffer.move('home');
        buffer.moveToOffset(0);
        return;
      }
      // Ctrl+E (End)
      if (key.ctrl && input === 'e') {
        buffer.move('end');
        buffer.moveToOffset(cpLen(buffer.text));
        return;
      }
      // Ctrl+L (Clear Screen)
      if (key.ctrl && input === 'l') {
        onClearScreen();
        return;
      }
      // Ctrl+P (History Up)
      if (key.ctrl && input === 'p' && !completion.showSuggestions) {
        inputHistory.navigateUp();
        return;
      }
      // Ctrl+N (History Down)
      if (key.ctrl && input === 'n' && !completion.showSuggestions) {
        inputHistory.navigateDown();
        return;
      }

      // Core text editing from MultilineTextEditor's useInput
      if (key.ctrl && input === 'k') {
        buffer.killLineRight();
        return;
      }
      if (key.ctrl && input === 'u') {
        buffer.killLineLeft();
        return;
      }
      const isCtrlX =
        (key.ctrl && (input === 'x' || input === '\x18')) || input === '\x18';
      const isCtrlEFromEditor =
        (key.ctrl && (input === 'e' || input === '\x05')) ||
        input === '\x05' ||
        (!key.ctrl &&
          input === 'e' &&
          input.length === 1 &&
          input.charCodeAt(0) === 5);

      if (isCtrlX || isCtrlEFromEditor) {
        if (isCtrlEFromEditor && !(key.ctrl && input === 'e')) {
          // Avoid double handling Ctrl+E
          buffer.openInExternalEditor();
          return;
        }
        if (isCtrlX) {
          buffer.openInExternalEditor();
          return;
        }
      }

      if (
        process.env['TEXTBUFFER_DEBUG'] === '1' ||
        process.env['TEXTBUFFER_DEBUG'] === 'true'
      ) {
        console.log('[InputPromptCombined] event', { input, key });
      }

      // Ctrl+Enter for newline, Enter for submit
      if (key.return) {
        const [row, col] = buffer.cursor;
        const line = buffer.lines[row];
        const charBefore = col > 0 ? cpSlice(line, col - 1, col) : '';

        if (key.ctrl || charBefore === '\\') {
          // Ctrl+Enter or escaped newline
          if (charBefore === '\\') {
            buffer.backspace();
          }
          buffer.newline();
        } else {
          // Enter for submit
          if (query.trim()) {
            handleSubmitAndClear(query);
          }
        }
        return;
      }

      // Standard arrow navigation within the buffer
      if (key.upArrow && !completion.showSuggestions) {
        if (shellModeActive) {
          const prevCommand = shellHistory.getPreviousCommand();
          if (prevCommand !== null) {
            buffer.setText(prevCommand);
          }
          return;
        }
        if (
          (buffer.allVisualLines.length === 1 || // Always navigate for single line
            (buffer.visualCursor[0] === 0 && buffer.visualScrollRow === 0)) &&
          inputHistory.navigateUp
        ) {
          inputHistory.navigateUp();
        } else {
          buffer.move('up');
        }
        return;
      }
      if (key.downArrow && !completion.showSuggestions) {
        if (shellModeActive) {
          const nextCommand = shellHistory.getNextCommand();
          if (nextCommand !== null) {
            buffer.setText(nextCommand);
          }
          return;
        }
        if (
          (buffer.allVisualLines.length === 1 || // Always navigate for single line
            buffer.visualCursor[0] === buffer.allVisualLines.length - 1) &&
          inputHistory.navigateDown
        ) {
          inputHistory.navigateDown();
        } else {
          buffer.move('down');
        }
        return;
      }

      // Fallback to buffer's default input handling
      buffer.handleInput(input, key as Record<string, boolean>);
    },
    {
      isActive: focus,
    },
  );

  const linesToRender = buffer.viewportVisualLines;
  const [cursorVisualRowAbsolute, cursorVisualColAbsolute] =
    buffer.visualCursor;
  const scrollVisualRow = buffer.visualScrollRow;

  return (
    <>
      <Box
        borderStyle="round"
        borderColor={shellModeActive ? Colors.AccentYellow : Colors.AccentBlue}
        paddingX={1}
      >
        <Text
          color={shellModeActive ? Colors.AccentYellow : Colors.AccentPurple}
        >
          {shellModeActive ? '! ' : '> '}
        </Text>
        <Box flexGrow={1} flexDirection="column">
          {buffer.text.length === 0 && placeholder ? (
            focus ? (
              <Text>
                {chalk.inverse(placeholder.slice(0, 1))}
                <Text color={Colors.Gray}>{placeholder.slice(1)}</Text>
              </Text>
            ) : (
              <Text color={Colors.Gray}>{placeholder}</Text>
            )
          ) : (
            linesToRender.map((lineText, visualIdxInRenderedSet) => {
              const cursorVisualRow = cursorVisualRowAbsolute - scrollVisualRow;
              let display = cpSlice(lineText, 0, inputWidth);
              const currentVisualWidth = stringWidth(display);
              if (currentVisualWidth < inputWidth) {
                display = display + ' '.repeat(inputWidth - currentVisualWidth);
              }

              if (visualIdxInRenderedSet === cursorVisualRow) {
                const relativeVisualColForHighlight = cursorVisualColAbsolute;
                if (relativeVisualColForHighlight >= 0) {
                  if (relativeVisualColForHighlight < cpLen(display)) {
                    const charToHighlight =
                      cpSlice(
                        display,
                        relativeVisualColForHighlight,
                        relativeVisualColForHighlight + 1,
                      ) || ' ';
                    const highlighted = chalk.inverse(charToHighlight);
                    display =
                      cpSlice(display, 0, relativeVisualColForHighlight) +
                      highlighted +
                      cpSlice(display, relativeVisualColForHighlight + 1);
                  } else if (
                    relativeVisualColForHighlight === cpLen(display) &&
                    cpLen(display) === inputWidth
                  ) {
                    display = display + chalk.inverse(' ');
                  }
                }
              }
              return (
                <Text key={`line-${visualIdxInRenderedSet}`}>{display}</Text>
              );
            })
          )}
        </Box>
      </Box>
      {completion.showSuggestions && (
        <Box>
          <SuggestionsDisplay
            suggestions={completion.suggestions}
            activeIndex={completion.activeSuggestionIndex}
            isLoading={completion.isLoadingSuggestions}
            width={suggestionsWidth}
            scrollOffset={completion.visibleStartIndex}
            userInput={buffer.text}
          />
        </Box>
      )}
    </>
  );
};
