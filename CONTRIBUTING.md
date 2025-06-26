# 如何贡献

我们非常乐意接受您对本项目的补丁和贡献。

## 开始之前

### 签署贡献者许可协议

对本项目的贡献必须附带一份[贡献者许可协议](https://cla.developers.google.com/about) (CLA)。您（或您的雇主）保留您贡献的版权；这只是授予我们使用和重新分发您的贡献作为项目一部分的权限。

如果您或您当前的雇主已经签署了 Google CLA（即使是针对不同的项目），您可能不需要再次签署。

请访问 <https://cla.developers.google.com/> 查看您当前的协议或签署新协议。

### 查看我们的社区准则

本项目遵循 [Google 的开源社区准则](https://opensource.google/conduct/)。

## 贡献流程

### 代码审查

所有提交，包括项目成员的提交，都需要审查。我们使用 [GitHub 拉取请求](https://docs.github.com/articles/about-pull-requests) 来实现此目的。

### 拉取请求指南

为了帮助我们快速审查和合并您的 PR，请遵循以下指南。不符合这些标准的 PR 可能会被关闭。

#### 1. 链接到现有问题

所有 PR 都应链接到我们跟踪器中的现有问题。这确保了在编写任何代码之前，每个更改都经过讨论并与项目目标保持一致。

- **对于错误修复：** PR 应链接到错误报告问题。
- **对于功能：** PR 应链接到已获得维护者批准的功能请求或提案问题。

如果您的更改问题不存在，请**先打开一个**并等待反馈，然后再开始编码。

#### 2. 保持小而专注

我们倾向于处理小而原子化的 PR，这些 PR 解决单个问题或添加单个、自包含的功能。

- **应该：** 创建一个修复一个特定错误或添加一个特定功能的 PR。
- **不应该：** 将多个不相关的更改（例如，错误修复、新功能和重构）捆绑到一个 PR 中。

大型更改应分解为一系列更小、逻辑化的 PR，这些 PR 可以独立审查和合并。

#### 3. 使用草稿 PR 进行进行中的工作

如果您想尽早获得关于您工作的反馈，请使用 GitHub 的**草稿拉取请求**功能。这向维护者表明 PR 尚未准备好进行正式审查，但可以进行讨论和初步反馈。

#### 4. 确保所有检查通过

在提交 PR 之前，请确保所有自动化检查都通过，方法是运行 `npm run preflight`。此命令运行所有测试、linting 和其他样式检查。

#### 5. 更新文档

如果您的 PR 引入了面向用户的更改（例如，新命令、修改的标志或行为更改），您还必须更新 `/docs` 目录中的相关文档。

#### 6. 编写清晰的提交消息和良好的 PR 描述

您的 PR 应该有一个清晰、描述性的标题和对更改的详细描述。请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 标准来编写您的提交消息。

- **好的 PR 标题：** `feat(cli): Add --json flag to 'config get' command`
- **坏的 PR 标题：** `Made some changes`

在 PR 描述中，解释您更改的“原因”并链接到相关问题（例如，`Fixes #123`）。

## Forking

如果您正在 Fork 仓库，您将能够运行构建、测试和集成测试工作流。但是，为了使集成测试运行，您需要添加一个 [Github 仓库密钥](<[url](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions#creating-secrets-for-a-repository)>)，其值为 `GEMINI_API_KEY`，并将其设置为您可用的有效 API 密钥。您的密钥和秘密对您的仓库是私有的；没有访问权限的人无法看到您的密钥，您也无法看到与此仓库相关的任何秘密。

此外，您需要单击 `Actions` 选项卡并为您的仓库启用工作流，您会发现它在屏幕中央是一个大的蓝色按钮。

## 开发设置和工作流程

本节指导贡献者如何构建、修改和理解本项目的开发设置。

### 设置开发环境

**先决条件：**

1. 安装 [Node 18+](https://nodejs.org/en/download)
2. Git

### 构建过程

克隆仓库：

```bash
git clone https://github.com/google-gemini/gemini-cli.git # 或您的 fork 的 URL
cd gemini-cli
```

安装 `package.json` 中定义的依赖项以及根依赖项：

```bash
npm install
```

构建整个项目（所有包）：

```bash
npm run build
```

此命令通常将 TypeScript 编译为 JavaScript，捆绑资产，并准备好包以供执行。有关构建期间发生的情况的更多详细信息，请参阅 `scripts/build.js` 和 `package.json` 脚本。

### 启用沙盒

强烈建议使用基于容器的[沙盒](#sandboxing)，并且至少需要在您的 `~/.env` 中设置 `GEMINI_SANDBOX=true` 并确保容器引擎（例如 `docker` 或 `podman`）可用。有关详细信息，请参阅[沙盒](#sandboxing)。

要同时构建 `gemini` CLI 实用程序和沙盒容器，请从根目录运行 `build:all`：

```bash
npm run build:all
```

要跳过构建沙盒容器，您可以使用 `npm run build` 代替。

### 运行

要从源代码启动 Gemini CLI（构建后），请从根目录运行以下命令：

```bash
npm start
```

如果您想在 `gemini-cli` 文件夹之外运行源代码构建，您可以使用 `npm link path/to/gemini-cli/packages/cli`（参见：[文档](https://docs.npmjs.com/cli/v9/commands/npm-link)）或 `alias gemini="node path/to/gemini-cli/packages/cli"` 来运行 `gemini`

### 运行测试

本项目包含两种类型的测试：单元测试和集成测试。

#### 单元测试

要执行项目的单元测试套件：

```bash
npm run test
```

这将运行位于 `packages/core` 和 `packages/cli` 目录中的测试。在提交任何更改之前，请确保测试通过。为了进行更全面的检查，建议运行 `npm run preflight`。

#### 集成测试

集成测试旨在验证 Gemini CLI 的端到端功能。它们不作为默认 `npm run test` 命令的一部分运行。

要运行集成测试，请使用以下命令：

```bash
npm run test:e2e
```

有关集成测试框架的更多详细信息，请参阅[集成测试文档](./docs/integration-tests.md)。

### Linting 和预检检查

为了确保代码质量和格式一致性，请运行预检检查：

```bash
npm run preflight
```

此命令将运行 ESLint、Prettier、所有测试以及项目中 `package.json` 中定义的其他检查。

_提示_

克隆后创建一个 git precommit 钩子文件，以确保您的提交始终是干净的。

```bash
echo "
# Run npm build and check for errors
if ! npm run preflight; then
  echo "npm build failed. Commit aborted."
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### 格式化

要单独格式化此项目中的代码，请从根目录运行以下命令：

```bash
npm run format
```

此命令使用 Prettier 根据项目的样式指南格式化代码。

#### Linting

要单独 lint 此项目中的代码，请从根目录运行以下命令：

```bash
npm run lint
```

### 编码约定

- 请遵守整个现有代码库中使用的编码风格、模式和约定。
- 请查阅 [GEMINI.md](https://github.com/google-gemini/gemini-cli/blob/main/GEMINI.md)（通常位于项目根目录中），了解与 AI 辅助开发相关的具体说明，包括 React、注释和 Git 使用的约定。
- **导入：** 请特别注意导入路径。项目使用 `eslint-rules/no-relative-cross-package-imports.js` 来强制执行包之间相对导入的限制。

### 项目结构

- `packages/`：包含项目的各个子包。
  - `cli/`：命令行界面。
  - `server/`：CLI 交互的后端服务器。
- `docs/`：包含所有项目文档。
- `scripts/`：用于构建、测试和开发任务的实用脚本。

有关更详细的架构，请参阅 `docs/architecture.md`。

## 调试

### VS Code:

0.  运行 CLI 以在 VS Code 中使用 `F5` 进行交互式调试
1.  从根目录以调试模式启动 CLI：
    ```bash
    npm run debug
    ```
    此命令在 `packages/cli` 目录中运行 `node --inspect-brk dist/gemini.js`，暂停执行直到调试器附加。然后您可以在 Chrome 浏览器中打开 `chrome://inspect` 以连接到调试器。
2.  在 VS Code 中，使用“附加”启动配置（在 `.vscode/launch.json` 中找到）。

或者，如果您更喜欢直接启动当前打开的文件，您可以使用 VS Code 中的“启动程序”配置，但通常建议使用“F5”。

要在沙盒容器内设置断点，请运行：

```bash
DEBUG=1 gemini
```

### React DevTools

要调试 CLI 基于 React 的 UI，您可以使用 React DevTools。Ink（用于 CLI 界面的库）与 React DevTools 版本 4.x 兼容。

1.  **以开发模式启动 Gemini CLI：**

    ```bash
    DEV=true npm start
    ```

2.  **安装并运行 React DevTools 版本 4.28.5（或最新的兼容 4.x 版本）：**

    您可以全局安装：

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    或者直接使用 npx 运行：

    ```bash
    npx react-devtools@4.28.5
    ```

    您正在运行的 CLI 应用程序应该连接到 React DevTools。
    ![](/docs/assets/connected_devtools.png)

## 沙盒

### MacOS Seatbelt

在 MacOS 上，`gemini` 使用 Seatbelt (`sandbox-exec`)，其配置文件为 `permissive-open`（参见 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`），该配置文件限制对项目文件夹的写入，但默认允许所有其他操作和出站网络流量（“开放”）。您可以通过在环境或 `.env` 文件中设置 `SEATBELT_PROFILE=restrictive-closed` 来切换到 `restrictive-closed` 配置文件（参见 `.../sandbox-macos-strict.sb`），该配置文件默认拒绝所有操作和出站网络流量（“关闭”）。可用的内置配置文件有 `{permissive,restrictive}-{open,closed,proxied}`（有关代理网络，请参见下文）。如果您还在项目设置目录 `.gemini` 下创建文件 `.gemini/sandbox-macos-<profile>.sb`，您也可以切换到自定义配置文件 `SEATBELT_PROFILE=<profile>`。

### 基于容器的沙盒（所有平台）

对于 MacOS 或其他平台上更强大的基于容器的沙盒，您可以在环境或 `.env` 文件中设置 `GEMINI_SANDBOX=true|docker|podman|<command>`。指定的命令（如果为 `true`，则为 `docker` 或 `podman`）必须安装在主机上。启用后，`npm run build:all` 将构建一个最小容器（“沙盒”）镜像，`npm start` 将在该容器的新实例中启动。首次构建可能需要 20-30 秒（主要是由于下载基础镜像），但之后构建和启动开销都应该很小。默认构建（`npm run build`）不会重新构建沙盒。

基于容器的沙盒以读写访问权限挂载项目目录（和系统临时目录），并在您启动/停止 Gemini CLI 时自动启动/停止/删除。在沙盒中创建的文件应自动映射到主机上的用户/组。您可以轻松指定额外的挂载、端口或环境变量，方法是根据需要设置 `SANDBOX_{MOUNTS,PORTS,ENV}`。您还可以通过在项目设置目录（`.gemini`）下创建文件 `.gemini/sandbox.Dockerfile` 和/或 `.gemini/sandbox.bashrc`，并运行 `gemini` 并设置 `BUILD_SANDBOX=1` 来触发自定义沙盒的构建，从而完全自定义您的项目沙盒。

#### 代理网络

所有沙盒方法，包括使用 `*-proxied` 配置文件的 MacOS Seatbelt，都支持通过自定义代理服务器限制出站网络流量，该代理服务器可以指定为 `GEMINI_SANDBOX_PROXY_COMMAND=<command>`，其中 `<command>` 必须启动一个代理服务器，该代理服务器侦听 `:::8877` 以处理相关请求。有关仅允许 `HTTPS` 连接到 `example.com:443`（例如 `curl https://example.com`）并拒绝所有其他请求的最小代理，请参见 `scripts/example-proxy.js`。代理与沙盒同时自动启动和停止。

## 手动发布

我们为每次提交发布一个工件到我们的内部注册表。但是，如果您需要手动进行本地构建，请运行以下命令：

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```
