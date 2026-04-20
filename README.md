========================================
Smart Video Summarizer for Obsidian
智能视频摘要插件 - 中英对照说明
========================================

【项目介绍 / Introduction】
中文：本插件可自动抓取 YouTube 或 B站 视频的字幕，调用 AI 模型（支持 Gemini、DeepSeek 及任何 OpenAI 兼容接口）生成结构化摘要，包含核心要点、详细摘要、关键结论和技术术语解释。摘要会保存为 Markdown 笔记。
English: This plugin automatically fetches subtitles from YouTube or Bilibili videos, calls an AI model (Gemini, DeepSeek, or any OpenAI‑compatible API) to generate a structured summary including key points, detailed summary, conclusions, and term explanations. The summary is saved as a Markdown note.

【安装 / Installation】
中文：
1. 将插件文件夹放入你的 Obsidian 仓库的 `.obsidian/plugins/` 目录。
2. 重启 Obsidian。
3. 在“设置 → 社区插件”中启用本插件。
English: 
1. Copy the plugin folder into `<your-vault>/.obsidian/plugins/`. 
2. Restart Obsidian. 
3. Enable the plugin in Settings → Community plugins.

【配置 / Configuration】
中文：点击插件设置齿轮图标进行配置：
- 选择激活的 AI 供应商（Active AI provider）。
- 管理 API 供应商：可添加/编辑/删除，填入名称、API Key、Base URL、模型名。点击“Test”验证连接。
- 调整摘要参数：Temperature（0~1）和 Max tokens。
- 选择无字幕时的处理策略：仅使用元数据 / 跳过 / 多模态 AI（待实现）。
English: Click the gear icon in plugin settings:
- Choose the active AI provider.
- Manage API providers: add/edit/delete, fill in name, API Key, Base URL, model. Click "Test" to verify.
- Adjust summary parameters: Temperature (0–1) and Max tokens.
- Choose no‑caption strategy: Use only metadata / Skip / Multimodal AI (coming soon).

【如何使用 / How to Use】
中文：四种方式触发摘要生成：
1. 粘贴链接：在笔记中粘贴 YouTube/B站 URL，自动开始处理。
2. 功能图标：点击左侧边栏的视频图标，输入或粘贴 URL。
3. 命令面板：Ctrl+P 输入“打开视频摘要”或“从选中的 URL 生成摘要”。
4. 插入时间戳：使用命令“插入时间戳”在光标处添加当前时间。
English: Four ways to trigger summarization:
1. Paste a YouTube/Bilibili URL anywhere in a note – automatically starts.
2. Ribbon icon: Click the video icon in the left sidebar, then enter the URL.
3. Command palette: Ctrl+P and type "Open video summary" or "From selected URL generate summary".
4. Insert timestamp: Use the command "Insert timestamp" to add current time at cursor.

【输出格式 / Output Format】
中文：生成的笔记包含 YAML 元数据（标题、作者、平台、链接、创建时间），随后是 AI 生成的 Markdown 摘要，最后附上原始字幕片段。
English: The generated note includes YAML frontmatter (title, author, platform, URL, creation time), followed by the AI‑generated Markdown summary, and finally an appendix with the original subtitles.

【开发者信息 / Developer Info】
中文：本插件使用 TypeScript 编写，遵循 Obsidian ESLint 规范。
核心模块：
- `api.ts`：适配器模式，支持 Gemini 和 OpenAI 兼容 API。
- `transcript.ts`：字幕抓取（目前为模拟，可集成 youtube‑transcript）。
- `settings.ts`：动态供应商管理与设置界面。
- `main.ts`：插件主逻辑、命令、UI 模态框。
贡献：欢迎提交 PR 或 issue。请遵守代码规范，避免 `any` 类型，处理 Promise。
English: Written in TypeScript, following Obsidian ESLint rules. 
Core modules:
- `api.ts`: Adapter pattern for Gemini and OpenAI‑compatible APIs.
- `transcript.ts`: Transcript fetching (currently mock; can integrate youtube‑transcript).
- `settings.ts`: Dynamic provider management and settings UI.
- `main.ts`: Main plugin logic, commands, UI modals.
Contributions: PRs and issues welcome. Please follow code style, avoid `any` type, handle Promises.

【常见问题 / FAQ】
中文：
Q: 提示“No transcript found”怎么办？ 
A: 视频可能没有字幕。可尝试其他视频，或将“无字幕处理策略”改为“仅使用元数据”。
Q: API 测试连接失败？ 
A: 检查 Base URL 和 API Key 是否正确，本地服务（如 Ollama）是否运行。
Q: 摘要很短或质量差？ 
A: 增加 Max tokens，降低 Temperature，或换用更好的模型。
English: 
Q: "No transcript found"? 
A: The video may lack subtitles. Try another video or set "No caption strategy" to "Use only metadata".
Q: API test connection fails? 
A: Verify Base URL and API Key. Ensure local server (e.g., Ollama) is running.
Q: Summary is short or low quality? 
A: Increase Max tokens, lower Temperature, or switch to a better model.

【许可 / License】
中文：MIT 许可证（或你选择的许可证）。详情请见仓库中的 LICENSE 文件。
English: MIT License (or your chosen license). See LICENSE file in the repository.

========================================
End of README-2026.04.19
========================================

========================================
Smart Video Summarizer - 开发者指南（中文版）
========================================

本指南面向希望参与开发、扩展或深入了解插件内部实现的开发者。

1. 项目结构
------------------------------------------------
smart-video-summarizer/
├── src/
│   ├── main.ts          # 插件入口、命令注册、UI 模态框
│   ├── settings.ts      # 设置接口与设置面板 UI
│   ├── api.ts           # API 适配器（Gemini、OpenAI 兼容等）
│   └── transcript.ts    # 字幕抓取模块（YouTube、Bilibili）
├── styles.css           # 插件样式
├── manifest.json        # 插件元数据（id、版本、依赖等）
├── package.json         # npm 依赖与脚本
└── tsconfig.json        # TypeScript 配置

2. 核心模块详解
------------------------------------------------
2.1 api.ts – API 适配器（策略模式）
- 定义 ApiAdapter 接口：
  - call(prompt, provider, options): Promise<string>
  - testConnection(provider): Promise<boolean>
- GeminiAdapter：处理 Google Gemini API（特殊 URL 格式 /models/{model}:generateContent?key=...）
- OpenAiCompatibleAdapter：处理任何 OpenAI 兼容端点（Ollama、Groq、DeepSeek 等）
- getApiAdapter(provider)：工厂函数，根据 provider.baseUrl 或名称返回正确适配器。

2.2 transcript.ts – 字幕抓取
- 当前为模拟实现（返回固定字符串）。
- 后续可集成真实库：
  npm install youtube-transcript
  并实现 fetchTranscript 函数，使用 YoutubeTranscript.fetchTranscript(videoId)。
- Bilibili 字幕可借助第三方 API 或解析页面，暂未实现。

2.3 settings.ts – 设置管理
- 定义 ApiProvider 接口：id, name, apiKey, baseUrl, model, isCustom。
- 默认供应商：Gemini 和 DeepSeek（内置，不可删除，但可编辑）。
- 供应商列表支持动态增删改，通过 generateId() 生成唯一 id。
- SmartVideoSummarizerSettingTab 类：
  - display() 方法渲染设置界面。
  - 使用 Setting API 构建下拉、按钮、滑块等。
  - 激活的供应商高亮显示（通过 CSS 类 mod-active-provider）。
- ProviderModal 类：
  - 编辑供应商信息（名称、API Key、Base URL、模型）。
  - 提供“Test”按钮，调用适配器的 testConnection 方法验证凭据。
  - API Key 输入框类型为 password。

2.4 main.ts – 插件主逻辑
- 继承 Plugin 类，实现 onload、onunload、loadSettings、saveSettings。
- migrateOldSettings：从旧版本设置（v1.0 之前）迁移到新供应商结构。
- 注册：
  - 左侧功能区图标（视频图标）
  - 三个命令：打开视频摘要、从选中的 URL 生成摘要、插入时间戳
  - 粘贴事件监听（editor-paste）
- generateSummaryFromUrl 主流程：
  1) 获取视频信息（getVideoInfo，支持 YouTube oEmbed 和 Bilibili BV 号）。
  2) 抓取字幕（调用 transcript.ts 中的方法）。
  3) 若失败则使用备选方案或根据无字幕策略处理。
  4) 构建提示词（buildPrompt）。
  5) 调用当前激活供应商的 API（通过适配器）。
  6) 保存摘要笔记（Markdown，含 frontmatter）。
- UrlInputModal 类：简单的 URL 输入模态框。

3. 开发环境搭建
------------------------------------------------
- 要求：Node.js 18+，npm 9+，Git。
- 克隆仓库后执行：
  npm install
- 开发模式：
  npm run dev
  （会监听 src/ 变化，自动编译到 main.js）
- 在 Obsidian 中测试：
  将 main.js、manifest.json、styles.css 复制到测试仓库的 .obsidian/plugins/smart-video-summarizer/ 目录。
  重启 Obsidian 并启用插件。
- 生产构建：
  npm run build

4. 代码规范与 ESLint
------------------------------------------------
- 使用 TypeScript 严格模式（strict: true）。
- 禁止使用 any 类型（必要时使用 unknown 或具体类型）。
- 所有 UI 文本必须遵循 sentence case（首字母大写，其余小写，专有名词除外）。
- 禁止内联样式（element.style），必须使用 CSS 类。
- Promise 必须被处理：await、.catch()、void 或 .then()。
- 控制台输出仅允许 console.debug、console.warn、console.error。
- 遵循 Obsidian 官方 ESLint 插件规则（obsidianmd/ 下的规则集）。
- 配置已在 eslint.config.mts 中启用，提交前请确保无警告。

5. 贡献指南
------------------------------------------------
- 欢迎提交 Pull Request 和 Issue。
- 新增功能前建议先开 issue 讨论。
- 代码提交前请运行 npm run build 确保无编译错误。
- 为新增的公共函数编写 JSDoc 注释。
- 为重要的逻辑变更编写单元测试（未来将引入 Jest）。
- 保持文件行数适中，若某个函数超过 60 行，考虑拆分。
- 对于 API 适配器，新供应商应继承 ApiAdapter 接口并在 getApiAdapter 中添加分支。

6. 错误处理最佳实践
------------------------------------------------
- 所有网络请求必须设置 timeout（建议 30 秒）。
- 捕获异常后，向用户显示可操作的 Notice（如“请检查 API Key”）。
- 使用 try-catch 包裹可能失败的异步操作，并回退到合理默认行为。
- 记录详细错误到控制台（console.error）以便调试，但不暴露敏感信息。

7. 国际化（i18n）与未来扩展
------------------------------------------------
- 当前仅支持中文和英文 UI 文本（硬编码）。未来可引入 i18n 库。
- 计划支持内嵌播放器（iframe）和时间戳同步。
- 计划支持批量处理多个视频链接。
- 计划支持多语言字幕选择。

8. 发布流程（当插件成熟时）
------------------------------------------------
- 更新 manifest.json 中的版本号。
- 运行 npm run build 生成 production 构建。
- 在 GitHub 上创建 release，附上 main.js、manifest.json、styles.css。
- 提交 PR 到 obsidian-releases 仓库，将插件加入社区列表。

9. 常见开发问题
------------------------------------------------
- 修改代码后 Obsidian 未更新：确保已将新 main.js 复制到插件目录，并重启 Obsidian（Ctrl+R）。
- TypeScript 报错找不到 Obsidian 类型：运行 npm install obsidian --save-dev。
- ESLint 报错 sentence case：检查字符串末尾是否有句号，专有名词是否可豁免（使用禁用注释）。
- 粘贴事件不触发：确认插件已启用，且粘贴内容为纯文本 URL（无格式）。

10. 致谢与联系方式
------------------------------------------------
- 感谢 Obsidian 团队提供优秀的 API。
- 问题反馈：请在 GitHub Issues 中描述步骤、截图和错误日志。
- 开发讨论：可在 Obsidian 中文社区或 Discord 相关频道进行。

========================================
最后更新：2026-04-19
版本对应：v1.0.0+
========================================

========================================
Smart Video Summarizer - Developer Guide (English)
========================================

This guide is for developers who want to contribute, extend, or understand the internal implementation of the plugin.

1. Project Structure
------------------------------------------------
smart-video-summarizer/
├── src/
│   ├── main.ts          # Plugin entry, command registration, UI modals
│   ├── settings.ts      # Settings interface and settings tab UI
│   ├── api.ts           # API adapters (Gemini, OpenAI-compatible, etc.)
│   └── transcript.ts    # Transcript fetching (YouTube, Bilibili)
├── styles.css           # Plugin styles
├── manifest.json        # Plugin metadata (id, version, dependencies)
├── package.json         # npm dependencies and scripts
└── tsconfig.json        # TypeScript configuration

2. Core Modules Overview
------------------------------------------------
2.1 api.ts – API Adapter (Strategy Pattern)
- Defines ApiAdapter interface:
  - call(prompt, provider, options): Promise<string>
  - testConnection(provider): Promise<boolean>
- GeminiAdapter: Handles Google Gemini API (special URL format /models/{model}:generateContent?key=...)
- OpenAiCompatibleAdapter: Handles any OpenAI‑compatible endpoint (Ollama, Groq, DeepSeek, etc.)
- getApiAdapter(provider): Factory function that returns the correct adapter based on provider.baseUrl or name.

2.2 transcript.ts – Transcript Fetching
- Currently a mock implementation (returns static string).
- Future integration: 
  npm install youtube-transcript
  then implement fetchTranscript using YoutubeTranscript.fetchTranscript(videoId).
- Bilibili subtitles may use third‑party API or page parsing; not yet implemented.

2.3 settings.ts – Settings Management
- Defines ApiProvider interface: id, name, apiKey, baseUrl, model, isCustom.
- Default providers: Gemini and DeepSeek (built‑in, not deletable, but editable).
- Dynamic provider list: add/edit/delete, generate unique id via generateId().
- SmartVideoSummarizerSettingTab class:
  - display() renders the settings UI.
  - Uses Setting API to build dropdowns, buttons, sliders, etc.
  - Active provider is highlighted (CSS class `mod-active-provider`).
- ProviderModal class:
  - Edit provider info (name, API key, Base URL, model).
  - Provides a "Test" button that calls the adapter's testConnection method.
  - API key input field type = "password".

2.4 main.ts – Main Plugin Logic
- Extends Plugin, implements onload, onunload, loadSettings, saveSettings.
- migrateOldSettings: Migrates from older settings (pre‑v1.0) to new provider structure.
- Registers:
  - Ribbon icon (video icon)
  - Three commands: Open video summary, Summarize from selected URL, Insert timestamp
  - Paste event listener (editor-paste)
- generateSummaryFromUrl main flow:
  1) Fetch video info (getVideoInfo, supports YouTube oEmbed and Bilibili BV id).
  2) Fetch transcript (calls transcript.ts methods).
  3) On failure, use fallback or follow no‑caption strategy.
  4) Build prompt (buildPrompt).
  5) Call current active provider API via adapter.
  6) Save summary note (Markdown with frontmatter).
- UrlInputModal: Simple modal for manual URL entry.

3. Development Environment Setup
------------------------------------------------
- Requirements: Node.js 18+, npm 9+, Git.
- After cloning the repository:
  npm install
- Development mode:
  npm run dev
  (watches src/ and rebuilds main.js on changes)
- Testing in Obsidian:
  Copy main.js, manifest.json, styles.css to <test-vault>/.obsidian/plugins/smart-video-summarizer/
  Restart Obsidian and enable the plugin.
- Production build:
  npm run build

4. Code Style & ESLint
------------------------------------------------
- TypeScript strict mode enabled (strict: true).
- No `any` type; use `unknown` or concrete types instead.
- All UI text must follow sentence case (first letter uppercase, rest lowercase except proper nouns).
- No inline styles (element.style); use CSS classes.
- Promises must be handled: await, .catch(), void, or .then().
- Console output allowed only for debug, warn, error.
- Follow Obsidian official ESLint rules (obsidianmd/ preset).
- Ensure no warnings before committing.

5. Contribution Guidelines
------------------------------------------------
- Welcome Pull Requests and Issues.
- For new features, open an issue first for discussion.
- Run `npm run build` before submitting to ensure no compilation errors.
- Write JSDoc comments for new public functions.
- Write unit tests for important logic (Jest to be introduced).
- Keep files reasonably sized; split functions longer than 60 lines.
- For new API providers, implement ApiAdapter and add branch in getApiAdapter.

6. Error Handling Best Practices
------------------------------------------------
- All network requests must have a timeout (recommended 30 seconds).
- On catch, display user‑friendly Notice (e.g., "Check your API key").
- Wrap async operations with try-catch and fallback to sensible defaults.
- Log detailed errors to console (console.error) for debugging, but avoid exposing sensitive info.

7. Internationalization (i18n) & Future Enhancements
------------------------------------------------
- Currently UI text is hardcoded in Chinese and English. i18n library may be added later.
- Planned: Embedded player (iframe) with timestamp sync.
- Planned: Batch processing of multiple video URLs.
- Planned: Multi‑language subtitle selection.

8. Release Process (when mature)
------------------------------------------------
- Update version in manifest.json.
- Run `npm run build` to produce production build.
- Create a GitHub release with main.js, manifest.json, styles.css attached.
- Submit a PR to obsidian-releases repository to add plugin to community list.

9. Common Development Issues
------------------------------------------------
- Changes not reflecting in Obsidian: Ensure new main.js copied to plugin folder and restart Obsidian (Ctrl+R).
- TypeScript cannot find Obsidian types: Run `npm install obsidian --save-dev`.
- ESLint sentence‑case error: Check if string ends with a period; for proper nouns use disable comment.
- Paste event not firing: Verify plugin is enabled and pasted content is plain text URL.

10. Acknowledgments & Contact
------------------------------------------------
- Thanks to Obsidian team for the excellent API.
- Bug reports: Open a GitHub Issue with steps, screenshots, and error logs.
- Development discussions: Obsidian Chinese community or Discord channels.

========================================
Last updated: 2026-04-19
Corresponds to version: v1.0.0+
========================================











==========以下是刚做插件时 github 荡下的插件说明========================

# Obsidian Sample Plugin

This is a sample plugin for Obsidian (https://obsidian.md).

This project uses TypeScript to provide type checking and documentation.
The repo depends on the latest plugin API (obsidian.d.ts) in TypeScript Definition format, which contains TSDoc comments describing what it does.

This sample plugin demonstrates some of the basic functionality the plugin API can do.
- Adds a ribbon icon, which shows a Notice when clicked.
- Adds a command "Open modal (simple)" which opens a Modal.
- Adds a plugin setting tab to the settings page.
- Registers a global click event and output 'click' to the console.
- Registers a global interval which logs 'setInterval' to the console.

## First time developing plugins?

Quick starting guide for new plugin devs:

- Check if [someone already developed a plugin for what you want](https://obsidian.md/plugins)! There might be an existing plugin similar enough that you can partner up with.
- Make a copy of this repo as a template with the "Use this template" button (login to GitHub if you don't see it).
- Clone your repo to a local development folder. For convenience, you can place this folder in your `.obsidian/plugins/your-plugin-name` folder.
- Install NodeJS, then run `npm i` in the command line under your repo folder.
- Run `npm run dev` to compile your plugin from `main.ts` to `main.js`.
- Make changes to `main.ts` (or create new `.ts` files). Those changes should be automatically compiled into `main.js`.
- Reload Obsidian to load the new version of your plugin.
- Enable plugin in settings window.
- For updates to the Obsidian API run `npm update` in the command line under your repo folder.

## Releasing new releases

- Update your `manifest.json` with your new version number, such as `1.0.1`, and the minimum Obsidian version required for your latest release.
- Update your `versions.json` file with `"new-plugin-version": "minimum-obsidian-version"` so older versions of Obsidian can download an older version of your plugin that's compatible.
- Create new GitHub release using your new version number as the "Tag version". Use the exact version number, don't include a prefix `v`. See here for an example: https://github.com/obsidianmd/obsidian-sample-plugin/releases
- Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments. Note: The manifest.json file must be in two places, first the root path of your repository and also in the release.
- Publish the release.

> You can simplify the version bump process by running `npm version patch`, `npm version minor` or `npm version major` after updating `minAppVersion` manually in `manifest.json`.
> The command will bump version in `manifest.json` and `package.json`, and add the entry for the new version to `versions.json`

## Adding your plugin to the community plugin list

- Check the [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).
- Publish an initial version.
- Make sure you have a `README.md` file in the root of your repo.
- Make a pull request at https://github.com/obsidianmd/obsidian-releases to add your plugin.

## How to use

- Clone this repo.
- Make sure your NodeJS is at least v16 (`node --version`).
- `npm i` or `yarn` to install dependencies.
- `npm run dev` to start compilation in watch mode.

## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`.

## Improve code quality with eslint
- [ESLint](https://eslint.org/) is a tool that analyzes your code to quickly find problems. You can run ESLint against your plugin to find common bugs and ways to improve your code. 
- This project already has eslint preconfigured, you can invoke a check by running`npm run lint`
- Together with a custom eslint [plugin](https://github.com/obsidianmd/eslint-plugin) for Obsidan specific code guidelines.
- A GitHub action is preconfigured to automatically lint every commit on all branches.

## Funding URL

You can include funding URLs where people who use your plugin can financially support it.

The simple way is to set the `fundingUrl` field to your link in your `manifest.json` file:

```json
{
    "fundingUrl": "https://buymeacoffee.com"
}
```

If you have multiple URLs, you can also do:

```json
{
    "fundingUrl": {
        "Buy Me a Coffee": "https://buymeacoffee.com",
        "GitHub Sponsor": "https://github.com/sponsors",
        "Patreon": "https://www.patreon.com/"
    }
}
```

## API Documentation

See https://docs.obsidian.md
