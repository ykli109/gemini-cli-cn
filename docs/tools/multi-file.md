# 多文件读取工具（`read_many_files`）

本文档描述了 Gemini CLI 的 `read_many_files` 工具。

## 描述

使用 `read_many_files` 从通过路径或 glob 模式指定的多个文件中读取内容。该工具的行为取决于提供的文件：

- 对于文本文件，此工具将其内容连接成单个字符串。
- 对于图像（例如，PNG、JPEG）和 PDF 文件，它读取并将其作为 base64 编码数据返回，前提是它们通过名称或扩展名明确请求。

`read_many_files` 可用于执行诸如获取代码库概览、查找特定功能实现的位置、审查文档或从多个配置文件收集上下文等任务。

### 参数

`read_many_files` 接受以下参数：

- `paths`（list[string]，必需）：相对于工具目标目录的 glob 模式或路径数组（例如，`["src/**/*.ts"]`、`["README.md", "docs/", "assets/logo.png"]`）。
- `exclude`（list[string]，可选）：要排除的文件/目录的 glob 模式（例如，`["**/*.log", "temp/"]`）。如果 `useDefaultExcludes` 为 true，这些会添加到默认排除项中。
- `include`（list[string]，可选）：要包含的其他 glob 模式。这些与 `paths` 合并（例如，`["*.test.ts"]` 如果它们被广泛排除则特定添加测试文件，或 `["images/*.jpg"]` 包含特定图像类型）。
- `recursive`（boolean，可选）：是否递归搜索。这主要由 glob 模式中的 `**` 控制。默认为 `true`。
- `useDefaultExcludes`（boolean，可选）：是否应用默认排除模式列表（例如，`node_modules`、`.git`、非图像/pdf 二进制文件）。默认为 `true`。
- `respect_git_ignore`（boolean，可选）：查找文件时是否遵循 .gitignore 模式。默认为 true。

## 如何在 Gemini CLI 中使用 `read_many_files`

`read_many_files` 搜索匹配提供的 `paths` 和 `include` 模式的文件，同时遵循 `exclude` 模式和默认排除项（如果启用）。

- 对于文本文件：它读取每个匹配文件的内容（尝试跳过未明确请求为图像/PDF 的二进制文件）并将其连接成单个字符串，在每个文件的内容之间使用分隔符 `--- {filePath} ---`。默认使用 UTF-8 编码。
- 对于图像和 PDF 文件：如果通过名称或扩展名明确请求（例如，`paths: ["logo.png"]` 或 `include: ["*.pdf"]`），工具读取文件并将其内容作为 base64 编码字符串返回。
- 该工具尝试通过检查其初始内容中的空字节来检测和跳过其他二进制文件（那些不匹配常见图像/PDF 类型或未明确请求的文件）。

用法：

```
read_many_files(paths=["您的文件或路径在这里。"], include=["要包含的其他文件。"], exclude=["要排除的文件。"], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## `read_many_files` 示例

读取 `src` 目录中的所有 TypeScript 文件：

```
read_many_files(paths=["src/**/*.ts"])
```

读取主 README、`docs` 目录中的所有 Markdown 文件和特定的 logo 图像，排除特定文件：

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

读取所有 JavaScript 文件，但明确包含测试文件和 `images` 文件夹中的所有 JPEG：

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## 重要说明

- **二进制文件处理：**
  - **图像/PDF 文件：** 该工具可以读取常见图像类型（PNG、JPEG 等）和 PDF 文件，将其作为 base64 编码数据返回。这些文件 _必须_ 通过 `paths` 或 `include` 模式明确目标（例如，通过指定确切的文件名如 `image.png` 或模式如 `*.jpeg`）。
  - **其他二进制文件：** 该工具尝试通过检查其初始内容中的空字节来检测和跳过其他类型的二进制文件。该工具从其输出中排除这些文件。
- **性能：** 读取大量文件或非常大的单个文件可能会消耗大量资源。
- **路径特定性：** 确保路径和 glob 模式相对于工具的目标目录正确指定。对于图像/PDF 文件，确保模式足够特定以包含它们。
- **默认排除项：** 注意默认排除模式（如 `node_modules`、`.git`），如果需要覆盖它们，请使用 `useDefaultExcludes=False`，但要谨慎操作。
