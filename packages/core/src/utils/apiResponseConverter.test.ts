/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  parseToolCallArgs,
  convertOpenAIResponseToGemini,
  OpenAIResponse,
  OpenAIToolCall,
} from './apiResponseConverter.js';

describe('apiResponseConverter', () => {
  describe('parseToolCallArgs', () => {
    it('应该正确解析有效的JSON参数', () => {
      const toolCall: OpenAIToolCall = {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'test_function',
          arguments: '{"param1": "value1", "param2": 42}',
        },
      };

      const result = parseToolCallArgs(toolCall, 'TestAPI');
      expect(result).toEqual({
        id: 'call_123',
        name: 'test_function',
        args: { param1: 'value1', param2: 42 },
      });
    });

    it('应该处理无效的JSON参数并返回空对象', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const toolCall: OpenAIToolCall = {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'test_function',
          arguments: 'invalid json',
        },
      };

      const result = parseToolCallArgs(toolCall, 'TestAPI');
      expect(result).toEqual({
        id: 'call_123',
        name: 'test_function',
        args: {},
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'TestAPI工具调用参数解析失败:',
        'test_function',
        'invalid json',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('应该处理空参数字符串', () => {
      const toolCall: OpenAIToolCall = {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'test_function',
          arguments: '',
        },
      };

      const result = parseToolCallArgs(toolCall, 'TestAPI');
      expect(result).toEqual({
        id: 'call_123',
        name: 'test_function',
        args: {},
      });
    });

    it('应该处理包含前导空格的参数', () => {
      const toolCall: OpenAIToolCall = {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'test_function',
          arguments: '  {"key": "value"}  ',
        },
      };

      const result = parseToolCallArgs(toolCall, 'TestAPI');
      expect(result).toEqual({
        id: 'call_123',
        name: 'test_function',
        args: { key: 'value' },
      });
    });
  });

  describe('convertOpenAIResponseToGemini', () => {
    it('应该转换纯文本响应', () => {
      const openAIResponse: OpenAIResponse = {
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello, world!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      const result = convertOpenAIResponseToGemini(openAIResponse, 'TestAPI');

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates?.[0]?.content?.parts).toEqual([
        { text: 'Hello, world!' },
      ]);
      expect(result.candidates?.[0]?.content?.role).toBe('model');
      expect(result.candidates?.[0]?.finishReason).toBe('stop');
      expect(result.usageMetadata).toEqual({
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      });
    });

    it('应该转换包含工具调用的响应', () => {
      const openAIResponse: OpenAIResponse = {
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'I will help you with that.',
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'search_web',
                    arguments: '{"query": "test"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
        },
      };

      const result = convertOpenAIResponseToGemini(openAIResponse, 'TestAPI');

      expect(result.candidates?.[0]?.content?.parts).toHaveLength(2);
      expect(result.candidates?.[0]?.content?.parts?.[0]).toEqual({
        text: 'I will help you with that.',
      });
      expect(result.candidates?.[0]?.content?.parts?.[1]).toEqual({
        functionCall: {
          id: 'call_123',
          name: 'search_web',
          args: { query: 'test' },
        },
      });

      // 检查functionCalls属性
      expect((result as any).functionCalls).toHaveLength(1);
      expect((result as any).functionCalls[0]).toEqual({
        id: 'call_123',
        name: 'search_web',
        args: { query: 'test' },
      });
    });

    it('应该处理空的choices数组', () => {
      const openAIResponse: OpenAIResponse = {
        choices: [],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      };

      expect(() => 
        convertOpenAIResponseToGemini(openAIResponse, 'TestAPI')
      ).toThrow('TestAPI响应中没有找到choices字段');
    });

    it('应该处理null内容', () => {
      const openAIResponse: OpenAIResponse = {
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 0,
          total_tokens: 5,
        },
      };

      const result = convertOpenAIResponseToGemini(openAIResponse, 'TestAPI');

      expect(result.candidates?.[0]?.content?.parts).toEqual([]);
    });
  });
}); 