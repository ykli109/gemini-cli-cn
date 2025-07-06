# Gemini CLI 项目概述

## 项目简介

**Gemini CLI** 是Google开发的一个命令行AI工作流工具，它连接到Google的Gemini AI模型，帮助开发者理解代码、加速工作流程。这是一个功能强大的AI编程助手。

## 主要功能

### 🤖 AI代码助手

- **大型代码库查询和编辑**：支持超过Gemini 1M token上下文窗口的代码分析
- **多模态能力**：可以从PDF或草图生成新应用
- **自动化操作任务**：如查询pull requests或处理复杂的代码重构

### 🛠️ 工具集成

- **MCP服务器支持**：连接新功能，包括媒体生成（Imagen、Veo、Lyria）
- **Google搜索集成**：内置Google搜索工具进行信息检索
- **文件操作工具**：读取、编辑、写入文件，目录浏览等
- **Git集成**：版本控制操作和历史分析
- **Shell命令执行**：直接执行系统命令

### 💻 用户界面

- **交互式CLI界面**：基于React和Ink构建的现代终端UI
- **主题系统**：支持多种颜色主题（包括GitHub Dark、Dracula、Atom One Dark等）
- **实时流式响应**：支持AI响应的实时显示
- **沙盒环境**：安全的代码执行环境

## 技术架构

### 📦 模块化设计

项目采用monorepo结构，分为两个主要包：

1.  **`@genius-ai/gemini-cli-core`** - 核心逻辑包

    - AI模型交互（Gemini API集成）
    - 工具注册和执行系统
    - 文件发现和Git服务
    - 遥测和日志记录

2.  **`@google/gemini-cli`** - CLI用户界面包
    - React/Ink构建的终端UI
    - 主题管理系统
    - 用户交互和输入处理
    - 配置管理

### 🔧 核心组件

**工具系统**：

- 文件操作：`read-file`, `write-file`, `edit`, `ls`, `glob`
- 代码分析：`grep`, `read-many-files`
- 网络功能：`web-fetch`, `web-search`
- 系统交互：`shell`
- MCP集成：`mcp-client`, `mcp-tool`

**认证系统**：

- Google OAuth2认证
- API密钥认证
- 支持个人和企业账户

**配置系统**：

- 用户级和项目级配置
- 主题和编辑器设置
- 沙盒配置

## 使用场景

### 📚 代码库探索

```bash
> Describe the main pieces of this system's architecture.
> What security mechanisms are in place?
```

### 🔨 代码开发

```bash
> Implement a first draft for GitHub issue #123.
> Help me migrate this codebase to the latest version of Java.
```

### 🤖 工作流自动化

```bash
> Make me a slide deck showing the git history from the last 7 days
> Convert all images in this directory to png format
```

## 技术栈

- **语言**：TypeScript/JavaScript (Node.js 18+)
- **UI框架**：React + Ink（终端UI）
- **AI集成**：Google Gemini API
- **测试**：Vitest
- **构建工具**：esbuild
- **代码质量**：ESLint + Prettier

## 部署和分发

- **NPM包**：`@google/gemini-cli`
- **Docker支持**：包含沙盒环境的容器化部署
- **CI/CD**：GitHub Actions自动化构建和测试

## 项目结构

```
gemini-cli/
├── packages/
│   ├── core/          # 核心逻辑包
│   │   ├── src/
│   │   │   ├── core/     # AI客户端和核心逻辑
│   │   │   ├── tools/    # 工具实现
│   │   │   ├── config/   # 配置管理
│   │   │   ├── utils/    # 工具函数
│   │   │   └── services/ # 服务层
│   │   └── package.json
│   └── cli/           # CLI用户界面包
│       ├── src/
│       │   ├── ui/       # React UI组件
│       │   ├── config/   # CLI配置
│       │   └── utils/    # CLI工具函数
│       └── package.json
├── bundle/            # 构建输出
├── docs/              # 文档
├── scripts/           # 构建和部署脚本
└── integration-tests/ # 集成测试
```

## 开发指南

### 安装依赖

```bash
npm ci
```

### 构建项目

```bash
npm run build
```

### 运行测试

```bash
npm run test
```

### 完整检查

```bash
npm run preflight
```

### 启动开发模式

```bash
npm start
```

## 总结

Gemini CLI展现了现代AI工具的设计理念：将强大的AI能力与开发者熟悉的命令行界面相结合，提供安全、高效的编程辅助体验。它不仅是一个代码助手，更是一个完整的AI驱动的开发工作流平台。
