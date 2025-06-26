# 教程

本页面包含与 Gemini CLI 交互的教程。

## 设置模型上下文协议（MCP）服务器

> [!CAUTION]
> 在使用第三方 MCP 服务器之前，请确保您信任其来源并了解它提供的工具。您使用第三方服务器的风险由您自己承担。

本教程演示如何设置 MCP 服务器，以 [GitHub MCP 服务器](https://github.com/github/github-mcp-server) 为例。GitHub MCP 服务器提供与 GitHub 仓库交互的工具，例如创建问题和评论拉取请求。

### 前提条件

在开始之前，请确保您已经安装并配置了以下内容：

- **Docker：** 安装并运行 [Docker]。
- **GitHub 个人访问令牌（PAT）：** 创建一个新的 [经典] 或 [细粒度] PAT，具有必要的作用域。

[Docker]: https://www.docker.com/
[经典]: https://github.com/settings/tokens/new
[细粒度]: https://github.com/settings/personal-access-tokens/new

### 指南

#### 在 `settings.json` 中配置 MCP 服务器

在您项目的根目录中，创建或打开 [`.gemini/settings.json` 文件](./configuration.md)。在文件中，添加 `mcpServers` 配置块，该块提供如何启动 GitHub MCP 服务器的说明。

```json
{
  "mcpServers": {
    "github": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "GITHUB_PERSONAL_ACCESS_TOKEN",
        "ghcr.io/github/github-mcp-server"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  }
}
```

#### 设置您的 GitHub 令牌

> [!CAUTION]
> 使用具有广泛作用域的个人访问令牌，该令牌可以访问个人和私有仓库，可能会导致私有仓库的信息泄露到公共仓库中。我们建议使用不共享对公共和私有仓库访问权限的细粒度访问令牌。

使用环境变量存储您的 GitHub PAT：

```bash
GITHUB_PERSONAL_ACCESS_TOKEN="pat_YourActualGitHubTokenHere"
```

Gemini CLI 在您在 `settings.json` 文件中定义的 `mcpServers` 配置中使用此值。

#### 启动 Gemini CLI 并验证连接

当您启动 Gemini CLI 时，它会自动读取您的配置并在后台启动 GitHub MCP 服务器。然后您可以使用自然语言提示要求 Gemini CLI 执行 GitHub 操作。例如：

```bash
"获取 'foo/bar' 仓库中分配给我的所有未解决问题并对它们进行优先级排序"
```
