## 认证设置

Gemini CLI 需要您通过 Google 的 AI 服务进行认证。在初始启动时，您需要配置以下认证方法之一：

1.  **使用 Google 登录（Gemini Code Assist）：**

    - 使用此选项通过您的 Google 账户登录。
    - 在初始启动期间，Gemini CLI 将引导您到网页进行认证。认证后，您的凭据将在本地缓存，因此在后续运行时可以跳过网页登录。
    - 请注意，网页登录必须在能够与运行 Gemini CLI 的机器通信的浏览器中完成。（具体来说，浏览器将被重定向到 Gemini CLI 正在监听的本地主机 URL）。
    - 用户可能需要指定 GOOGLE_CLOUD_PROJECT，如果：
      1. 您有 Google Workspace 账户。Google Workspace 是为企业和组织提供的付费服务，提供一套生产力工具，包括自定义电子邮件域（例如 your-name@your-company.com）、增强的安全功能和管理控制。这些账户通常由雇主或学校管理。
      2. 您是许可的 Code Assist 用户。如果您之前购买了 Code Assist 许可证或通过 Google 开发者程序获得了许可证，就会发生这种情况。
      - 如果您属于这些类别之一，您必须首先配置要使用的 Google Cloud 项目 ID，[启用 Gemini for Cloud API](https://cloud.google.com/gemini/docs/discover/set-up-gemini#enable-api) 并[配置访问权限](https://cloud.google.com/gemini/docs/discover/set-up-gemini#grant-iam)。您可以使用以下命令在当前 shell 会话中临时设置环境变量：
        ```bash
        export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
        ```
        - 为了重复使用，您可以将环境变量添加到您的 `.env` 文件（位于项目目录或用户主目录中）或 shell 的配置文件（如 `~/.bashrc`、`~/.zshrc` 或 `~/.profile`）。例如，以下命令将环境变量添加到 `~/.bashrc` 文件：
        ```bash
        echo 'export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"' >> ~/.bashrc
        source ~/.bashrc
        ```

2.  **<a id="gemini-api-key"></a>Gemini API 密钥：**

    - 从 Google AI Studio 获取您的 API 密钥：[https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
    - 设置 `GEMINI_API_KEY` 环境变量。在以下方法中，将 `YOUR_GEMINI_API_KEY` 替换为您从 Google AI Studio 获得的 API 密钥：
      - 您可以使用以下命令在当前 shell 会话中临时设置环境变量：
        ```bash
        export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
        ```
      - 为了重复使用，您可以将环境变量添加到您的 `.env` 文件（位于项目目录或用户主目录中）或 shell 的配置文件（如 `~/.bashrc`、`~/.zshrc` 或 `~/.profile`）。例如，以下命令将环境变量添加到 `~/.bashrc` 文件：
        ```bash
        echo 'export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"' >> ~/.bashrc
        source ~/.bashrc
        ```

3.  **<a id="workspace-gca"></a>使用 Google 登录（适用于 Workspace 或许可的 Code Assist 用户的 Gemini Code Assist）：**

    （更多信息请参见：https://developers.google.com/gemini-code-assist/resources/faqs#gcp-project-requirement）

    - 在以下情况下使用此选项：

      1. 您有 Google Workspace 账户。Google Workspace 是为企业和组织提供的付费服务，提供一套生产力工具，包括自定义电子邮件域（例如 your-name@your-company.com）、增强的安全功能和管理控制。这些账户通常由雇主或学校管理。
      2. 您是许可的 Code Assist 用户。如果您之前购买了 Code Assist 许可证或通过 Google 开发者程序获得了许可证，就会发生这种情况。

    - 如果您属于这些类别之一，您必须首先配置要使用的 Google Cloud 项目 ID，[启用 Gemini for Cloud API](https://cloud.google.com/gemini/docs/discover/set-up-gemini#enable-api) 并[配置访问权限](https://cloud.google.com/gemini/docs/discover/set-up-gemini#grant-iam)。您可以使用以下命令在当前 shell 会话中临时设置环境变量：
      ```bash
      export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
      ```
      - 为了重复使用，您可以将环境变量添加到您的 `.env` 文件（位于项目目录或用户主目录中）或 shell 的配置文件（如 `~/.bashrc`、`~/.zshrc` 或 `~/.profile`）。例如，以下命令将环境变量添加到 `~/.bashrc` 文件：
      ```bash
      echo 'export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"' >> ~/.bashrc
      source ~/.bashrc
      ```
    - 在启动期间，Gemini CLI 将引导您到网页进行认证。认证后，您的凭据将在本地缓存，因此在后续运行时可以跳过网页登录。
    - 请注意，网页登录必须在能够与运行 Gemini CLI 的机器通信的浏览器中完成。（具体来说，浏览器将被重定向到 Gemini CLI 正在监听的本地主机 URL）。

4.  **Vertex AI：**
    - 如果不使用快速模式：
      - 确保您有 Google Cloud 项目并已启用 Vertex AI API。
      - 使用以下命令设置应用程序默认凭据（ADC）：
        ```bash
        gcloud auth application-default login
        ```
        更多信息请参见[为 Google Cloud 设置应用程序默认凭据](https://cloud.google.com/docs/authentication/provide-credentials-adc)。
      - 设置 `GOOGLE_CLOUD_PROJECT`、`GOOGLE_CLOUD_LOCATION` 和 `GOOGLE_GENAI_USE_VERTEXAI` 环境变量。在以下方法中，将 `YOUR_PROJECT_ID` 和 `YOUR_PROJECT_LOCATION` 替换为您项目的相关值：
        - 您可以使用以下命令在当前 shell 会话中临时设置这些环境变量：
          ```bash
          export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
          export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION" # 例如，us-central1
          export GOOGLE_GENAI_USE_VERTEXAI=true
          ```
        - 为了重复使用，您可以将环境变量添加到您的 `.env` 文件（位于项目目录或用户主目录中）或 shell 的配置文件（如 `~/.bashrc`、`~/.zshrc` 或 `~/.profile`）。例如，以下命令将环境变量添加到 `~/.bashrc` 文件：
          ```bash
          echo 'export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"' >> ~/.bashrc
          echo 'export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION"' >> ~/.bashrc
          echo 'export GOOGLE_GENAI_USE_VERTEXAI=true' >> ~/.bashrc
          source ~/.bashrc
          ```
    - 如果使用快速模式：
      - 设置 `GOOGLE_API_KEY` 环境变量。在以下方法中，将 `YOUR_GOOGLE_API_KEY` 替换为快速模式提供的 Vertex AI API 密钥：
        - 您可以使用以下命令在当前 shell 会话中临时设置这些环境变量：
          ```bash
          export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
          export GOOGLE_GENAI_USE_VERTEXAI=true
          ```
        - 为了重复使用，您可以将环境变量添加到您的 `.env` 文件（位于项目目录或用户主目录中）或 shell 的配置文件（如 `~/.bashrc`、`~/.zshrc` 或 `~/.profile`）。例如，以下命令将环境变量添加到 `~/.bashrc` 文件：
          ```bash
          echo 'export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"' >> ~/.bashrc
          echo 'export GOOGLE_GENAI_USE_VERTEXAI=true' >> ~/.bashrc
          source ~/.bashrc
          ```
