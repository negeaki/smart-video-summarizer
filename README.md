# Smart Video Summarizer

An Obsidian plugin that automatically fetches subtitles from YouTube and Bilibili, calls an AI to generate a structured summary, and features an embedded player, timestamp insertion, and a jotting section.

## Key Features

- **One‑click summarization**: Paste a video URL → fetch subtitles → AI generates a summary with key points, detailed summary, conclusions, and term explanations.
- **Multi‑platform**: Supports YouTube (including short links) and Bilibili (BV ID).
- **Multi‑AI providers**: Built‑in Gemini and DeepSeek; add any OpenAI‑compatible provider (e.g., Groq, Ollama).
- **Embedded player**: Plays videos in the Obsidian sidebar without auto‑play to avoid distraction.
- **Timestamp insertion**: Use a custom shortcut to insert the current time under the "Timestamp" section of your note.
- **Screenshot **: A button in the player guides you to use the system screenshot tool and automatically opens the note for pasting.
- **History**: Automatically saves the last 20 summaries, with per‑entry deletion and a clear‑all button.
- **No‑caption handling**: Choose to use metadata, import a local subtitle file (.srt/.vtt/.txt/.ass), or skip the video.
- **Fully local**: All API calls go directly from your machine to the provider; no intermediate server.

## Installation

1. Download main.js, manifest.json, and styles.css from [GitHub Releases](https://github.com/negeaki/smart-video-summarizer/releases).
2. Create a folder called claudian in your vault's plugins folder:
/path/to/vault/.obsidian/plugins/claudian/
3.  copy the folder to `<your-vault>/.obsidian/plugins/`.
4. Restart Obsidian and enable the plugin in Settings → Community plugins.

## Configuration

- Set up API providers (API key, Base URL, model name).
- Adjust summary parameters (Temperature, Max tokens).
- Choose player position (left/right sidebar) and whether to open automatically.
- Select no‑caption strategy (metadata / local subtitle / skip).
- Set the maximum number of history entries (default 20).

## Shortcuts

| Action | How to bind |
|--------|--------------|
| Insert timestamp | Settings → Hotkeys → search "Insert timestamp" |
| Open video player | Settings → Hotkeys → search `Open video player` |

💡 Recommended: bind `Ctrl+Shift+T` (timestamp) and `Ctrl+Shift+P` (player).

## Usage

1. Click the video icon in the left ribbon, paste a YouTube or Bilibili URL, then click "Summarize".
2. The plugin generates a structured note and opens the player (if enabled).
3. After reading the summary, manually start playback.
4. While watching, press your shortcut to insert a timestamp (cursor moves after the timestamp, ready for notes).
5. Press the jotting shortcut to jump to the "Jotting" section and write detailed notes.
6. To take a screenshot, click the 📷 button in the player, use your system screenshot tool (Win+Shift+S), then paste into the note.

## FAQ

**Q: "No transcript found"?**  
A: The video may lack subtitles. Try another video or change the no‑caption strategy to "Use only metadata".

**Q: API test connection fails?**  
A: Verify the Base URL and API key. For local servers (e.g., Ollama), ensure the service is running and the port is correct.

**Q: How to import a local subtitle file?**  
A: Set the no‑caption strategy to "Import local subtitle file". When generating a summary, a file picker will appear.

## License

MIT