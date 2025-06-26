# Gemini CLI 核心：工具 API

Gemini CLI 核心（`packages/core`）具有用于定义、注册和执行工具的强大系统。这些工具扩展了 Gemini 模型的功能，使其能够与本地环境交互、获取网络内容并执行超出简单文本生成的各种操作。

## 核心概念

- **工具（`tools.ts`）：** 定义所有工具契约的接口和基类（`BaseTool`）。每个工具必须具有：

  - `name`：唯一的内部名称（在对 Gemini 的 API 调用中使用）。
  - `displayName`：用户友好的名称。
  - `description`：工具功能的清晰说明，提供给 Gemini 模型。
  - `parameterSchema`：定义工具接受参数的 JSON 模式。这对于 Gemini 模型理解如何正确调用工具至关重要。
  - `validateToolParams()`：验证传入参数的方法。
  - `getDescription()`：提供工具在执行前使用特定参数执行操作的人类可读描述的方法。
  - `shouldConfirmExecute()`：确定执行前是否需要用户确认的方法（例如，对于潜在破坏性操作）。
  - `execute()`：执行工具操作并返回 `ToolResult` 的核心方法。

- **`ToolResult`（`tools.ts`）：** 定义工具执行结果结构的接口：

  - `llmContent`：要包含在发送回 LLM 以提供上下文的历史记录中的事实字符串内容。
  - `returnDisplay`：用户友好的字符串（通常是 Markdown）或用于在 CLI 中显示的特殊对象（如 `FileDiff`）。

- **工具注册表（`tool-registry.ts`）：** 负责以下操作的类（`ToolRegistry`）：
  - **注册工具：** 保存所有可用内置工具的集合（例如，`ReadFileTool`、`ShellTool`）。
  - **发现工具：** 它还可以动态发现工具：
    - **基于命令的发现：** 如果在设置中配置了 `toolDiscoveryCommand`，则执行此命令。它预期输出描述自定义工具的 JSON，然后这些工具被注册为 `DiscoveredTool` 实例。
    - **基于 MCP 的发现：** 如果配置了 `mcpServerCommand`，注册表可以连接到模型上下文协议（MCP）服务器以列出和注册工具（`DiscoveredMCPTool`）。
  - **提供模式：** 向 Gemini 模型公开所有注册工具的 `FunctionDeclaration` 模式，使其知道哪些工具可用以及如何使用它们。
  - **检索工具：** 允许核心按名称获取特定工具以供执行。

## 内置工具

核心带有一套预定义工具，通常位于 `packages/core/src/tools/`。这些工具包括：

- **文件系统工具：**
  - `LSTool`（`ls.ts`）：列出目录内容。
  - `ReadFileTool`（`read-file.ts`）：读取单个文件的内容。它接受 `absolute_path` 参数，该参数必须是绝对路径。
  - `WriteFileTool`（`write-file.ts`）：将内容写入文件。
  - `GrepTool`（`grep.ts`）：在文件中搜索模式。
  - `GlobTool`（`glob.ts`）：查找匹配 glob 模式的文件。
  - `EditTool`（`edit.ts`）：对文件进行就地修改（通常需要确认）。
  - `ReadManyFilesTool`（`read-many-files.ts`）：从多个文件或 glob 模式读取和连接内容（由 CLI 中的 `@` 命令使用）。
- **执行工具：**
  - `ShellTool`（`shell.ts`）：执行任意 shell 命令（需要谨慎的沙盒和用户确认）。
- **网络工具：**
  - `WebFetchTool`（`web-fetch.ts`）：从 URL 获取内容。
  - `WebSearchTool`（`web-search.ts`）：执行网络搜索。
- **内存工具：**
  - `MemoryTool`（`memoryTool.ts`）：与 AI 的内存交互。

每个工具都扩展了 `BaseTool` 并实现了其特定功能所需的方法。

## 工具执行流程

1.  **模型请求：** Gemini 模型基于用户的提示和提供的工具模式，决定使用工具并在其响应中返回 `FunctionCall` 部分，指定工具名称和参数。
2.  **核心接收请求：** 核心解析此 `FunctionCall`。
3.  **工具检索：** 它在 `ToolRegistry` 中查找请求的工具。
4.  **参数验证：** 调用工具的 `validateToolParams()` 方法。
5.  **确认（如果需要）：**
    - 调用工具的 `shouldConfirmExecute()` 方法。
    - 如果它返回确认的详细信息，核心将此信息传达给 CLI，CLI 提示用户。
    - 用户的决定（例如，继续、取消）被发送回核心。
6.  **执行：** 如果已验证和确认（或如果不需要确认），核心使用提供的参数和 `AbortSignal`（用于潜在取消）调用工具的 `execute()` 方法。
7.  **结果处理：** 核心接收来自 `execute()` 的 `ToolResult`。
8.  **响应模型：** 来自 `ToolResult` 的 `llmContent` 被打包为 `FunctionResponse` 并发送回 Gemini 模型，以便它可以继续生成面向用户的响应。
9.  **显示给用户：** 来自 `ToolResult` 的 `returnDisplay` 被发送到 CLI 以向用户显示工具所做的操作。

## 使用自定义工具扩展

虽然用户通过编程方式直接注册新工具在提供的文件中没有明确详述为典型最终用户的主要工作流程，但架构通过以下方式支持扩展：

- **基于命令的发现：** 高级用户或项目管理员可以在 `settings.json` 中定义 `toolDiscoveryCommand`。此命令在由 Gemini CLI 核心运行时，应输出 `FunctionDeclaration` 对象的 JSON 数组。核心然后将使这些可用作 `DiscoveredTool` 实例。相应的 `toolCallCommand` 然后负责实际执行这些自定义工具。
- **MCP 服务器：** 对于更复杂的场景，可以设置一个或多个 MCP 服务器并通过 `settings.json` 中的 `mcpServers` 设置进行配置。Gemini CLI 核心然后可以发现并使用这些服务器公开的工具。如前所述，如果您有多个 MCP 服务器，工具名称将以您配置中的服务器名称为前缀（例如，`serverAlias__actualToolName`）。

这个工具系统提供了一种灵活而强大的方式来增强 Gemini 模型的功能，使 Gemini CLI 成为各种任务的多功能助手。
