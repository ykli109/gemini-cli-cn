# Gemini CLI

[![Gemini CLI CI](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml)

![Gemini CLI 截图](./docs/assets/gemini-screenshot.png)

Gemini CLI 是一个命令行 AI 工具，能够连接各种工具、理解代码，帮你提升工作效率。

使用 Gemini CLI 可以：

- 查询和编辑大型代码库，充分利用 Gemini 100 万令牌的强大上下文能力
- 基于 PDF 或草图生成新应用，发挥 Gemini 的多模态优势
- 自动化日常任务，比如查询 PR 或处理复杂的代码合并
- 通过工具和 MCP 服务器扩展功能，包括[使用 Imagen、Veo 或 Lyria 生成媒体内容](https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/tree/main/experiments/mcp-genmedia)
- 利用内置的 [Google 搜索](https://ai.google.dev/gemini-api/docs/grounding)工具，让查询结果更准确

## 快速上手

1. **环境要求：** 确保已安装 [Node.js 18](https://nodejs.org/en/download) 或更高版本
2. **运行 CLI：** 在终端执行以下命令：

   ```bash
   npx https://github.com/ykli109/gemini-cli-cn
   ```

   也可以全局安装：

   ```bash
   npm install -g gemini-cli-cn
   gemini
   ```

3. **选择主题颜色**
4. **登录账号：** 按提示用个人 Google 账户登录，每分钟可调用 60 次模型，每天最多 1000 次

现在就可以开始使用 Gemini CLI 中文版了！

### 进阶用法

如果需要使用特定模型或更高的调用频率，可以使用 API 密钥：

1. 在 [Google AI Studio](https://aistudio.google.com/apikey) 生成密钥
2. 在终端设置环境变量，把 `YOUR_API_KEY` 替换成你的密钥：

   ```bash
   export GEMINI_API_KEY="YOUR_API_KEY"
   ```

其他登录方式（包括 Google Workspace 账户）请查看[身份验证指南](./docs/cli/authentication.md)。

## 使用示例

启动 CLI 后，就可以在终端里和 Gemini 对话了。

新项目从空目录开始：

```sh
cd new-project/
gemini
> 帮我写一个 Discord 机器人，能根据 FAQ.md 文件回答问题
```

也可以在现有项目中使用：

```sh
git clone https://github.com/google-gemini/gemini-cli
cd gemini-cli
gemini
> 总结一下昨天的所有代码变更
```

### 接下来

- 了解如何[参与贡献或从源码构建](./CONTRIBUTING.md)
- 查看所有 **[CLI 命令](./docs/cli/commands.md)**
- 遇到问题时查看 **[故障排除指南](./docs/troubleshooting.md)**
- 更详细的内容请看[完整文档](./docs/index.md)
- 参考一些[常用场景](#常用场景)获取灵感

### 故障排除

遇到问题可以查看[故障排除指南](docs/troubleshooting.md)。

## 常用场景

### 了解新项目

进入项目目录运行 `gemini`：

```text
> 介绍一下这个系统的主要架构
```

```text
> 这里用了哪些安全措施？
```

### 代码开发

```text
> 帮我实现 GitHub issue #123 的初版代码
```

```text
> 把这个项目升级到最新的 Java 版本，先做个计划
```

### 工作流自动化

用 MCP 服务器连接本地工具和企业协作平台：

```text
> 做个幻灯片，展示最近 7 天的 git 提交，按功能和开发者分组
```

```text
> 做个全屏网页应用，在大屏上显示最活跃的 GitHub 问题
```

### 系统操作

```text
> 把这个文件夹里的图片都转成 png 格式，用 exif 里的日期重命名
```

```text
> 把 PDF 发票按月份整理好
```

## 服务条款和隐私政策

使用 Gemini CLI 的服务条款和隐私政策详情，请查看[服务条款和隐私政策](./docs/tos-privacy.md)。
