# Smart Video Summarizer for Obsidian

An Obsidian plugin that automatically fetches subtitles from YouTube and Bilibili, calls an AI to generate a structured summary, and features an embedded player, timestamp insertion, and a jotting section.

## 📦 Installation

1. Download `main.js`, `manifest.json`, `styles.css` from the [Releases](https://github.com/yourusername/smart-video-summarizer/releases) page
2. Create a folder `smart-video-summarizer` inside `.obsidian/plugins/` in your vault
3. Copy the three files into that folder
4. Restart Obsidian and enable the plugin in Settings → Community plugins.

## ⚙️ Configuration

Open the plugin settings tab to configure:

### 1. AI Provider
- Choose the active provider (Gemini / DeepSeek / custom)
- Add custom providers (API Key, Base URL, Model)
- Test connection button

### 2. Summary Parameters
- **Temperature** – randomness (0 = deterministic, 1 = creative)
- **Max tokens** – maximum length of the generated summary

### 3. Video Player
- **Enable mini player** – automatically open the sidebar player when generating a summary
- **Player position** – show player in left or right sidebar

### 4. No Caption Strategy
- **Use only metadata** – generate summary from video title/author only
- **Import local subtitle file** – prompt to upload `.srt`, `.vtt`, `.ass`, or `.txt`
- **Skip this video** – do nothing when no subtitles are found

### 5. History
- Max number of history entries (1–100)
- List of all summarized videos; open notes or replay videos
- Delete individual entries or clear all history

## 🚀 Usage

### Quick start
1. **Get an API key** – for Gemini, visit [Google AI Studio](https://aistudio.google.com/) (free tier available)
2. **Configure the plugin** – paste your API key and select the provider
3. **Summarize a video**:
   - Click the video icon in the left ribbon, or
   - Run the command “Open video summarizer”, or
   - Paste a YouTube/Bilibili link directly into an editor – the plugin will automatically start

### Commands (assign hotkeys in Obsidian settings)
| Command name | Command ID | Description |
|--------------|------------|-------------|
| Open video summarizer | `open-video-summarizer` | Shows the URL input modal |
| Summarize from selected URL | `summarize-from-selected-url` | Summarizes the video link currently selected in the editor |
| Insert timestamp in current video note | `insert-timestamp-in-video-note` | Inserts `[⏰ HH:MM:SS]` under the “### 时间戳” heading (only works in a video summary note) |
| Open video player | `open-video-player` | Shows/focuses the sidebar video player |

**Recommended hotkeys**:
- `Ctrl+Shift+T` – Insert timestamp
- `Ctrl+Shift+V` – Open video summarizer (or use the ribbon icon)

### Video player
- Automatically opens if “Enable mini player” is on
- Embedded YouTube/Bilibili player in the sidebar
- Screenshot button shows a system tooltip and opens the corresponding summary note

### Timestamps & jotting
- Every generated note contains `### 时间戳` and `### 随手记` sections
- The timestamp command inserts the current time under the timestamp heading
- The jotting area is free‑form – you can write notes manually

## 🛠️ Technical details

- **Subtitle fetching** – YouTube uses `youtube-transcript`; Bilibili uses the official API
- **AI adapters** – Gemini uses the dedicated endpoint; all others use OpenAI Chat Completions format
- **Note storage** – default folder is `Video Summaries`; file name is `{title}_摘要.md`
- **Frontmatter** – includes `title`, `author`, `platform`, `video_url`, `created` – used to identify video notes

## 🤝 Contributing

Issues and pull requests are welcome. Please follow Obsidian plugin conventions: no `any`, no unused variables, no inline styles, use sentence case for English UI strings.

## 📄 License

[MIT](LICENSE)

## 🙏 Acknowledgements

- [Obsidian](https://obsidian.md) for the amazing plugin system
- [youtube-transcript](https://github.com/Kakadu-dev/youtube-transcript) library
- All users of this plugin

---
