# Smart Video Summarizer for Obsidian 

An Obsidian plugin that automatically fetches subtitles from YouTube and Bilibili videos and uses AI to generate structured summary notes, with an embedded video player and clickable timestamps.

## Features

- Support for YouTube and Bilibili video links.
- Automatically retrieve official subtitles; if none exist, you can import local `.srt`, `.vtt`, `.ass`, or `.txt` files.
- Integrate multiple AI providers (Gemini, Grok, DeepSeek, or any OpenAI-compatible endpoint).
- Generate structured notes containing key points, a detailed summary, main conclusions, technical term explanations, and tags.
- Long transcripts are automatically split into chunks to bypass context length limits.
- Embedded video player with picture-in-picture and progress memory.
- Clickable timestamps inside notes that jump to the corresponding video time.
- Optional auto‑summarization when pasting a video link (configurable).
- Dataview‑compatible frontmatter (`tags`, `aliases`, `video_url`, etc.).

## Installation

### Manual Installation
1. Download the latest `main.js`, `manifest.json`, and `styles.css` from the Releases page.
2. Place the three files inside your Obsidian vault at `.obsidian/plugins/smart-video-summarizer/`.
3. Restart Obsidian and enable the plugin in Settings.

### Via BRAT
1. Install and enable the BRAT plugin.
2. Add this repository’s GitHub URL in BRAT settings.
3. Enable the plugin from the Community Plugins list.

## Usage

### Generate a Video Summary
- Click the video icon in the left sidebar, or run the command `Open video summarizer`.
- Paste a YouTube or Bilibili link into the pop‑up input box.
- Click `Summarize` and wait for the AI to generate the note.
- The note is automatically saved in your configured folder, including video metadata and an appendix with the transcript.

### Quick Actions
- Select a video link and run the command `Summarize from selected URL`.
- Paste a video link in the editor (requires the `Auto summarize on paste` setting).
- Inside a video summary note, run the command `Insert timestamp` to add a clickable timestamp.

### Timestamp Jump
- Timestamps inserted in the format `[⏰ HH:MM:SS]` become clickable links that jump the embedded player to that exact moment.

### Video Player
- Run the command `Open video player`, or enable `Enable mini player` to have the player open automatically after generating a summary.
- The player supports progress memory and picture‑in‑picture mode.

## Plugin Settings

- **Default folder** – Where summary notes are saved.
- **AI provider configuration** – Add multiple API keys; supports custom endpoints.
- **No‑caption strategy** – Skip, import a local subtitle file, or fall back to metadata‑only summary.
- **Auto summarize on paste** – Automatically trigger generation when a video link is pasted.
- **Player position** – Show the player in the left or right sidebar.

## Dependencies

- Access to `youtube.com` is required for YouTube subtitle fetching.
- Access to `api.bilibili.com` is required for Bilibili video information.
- An API key for one of the supported AI providers is needed for summarization.

## FAQ

### "Video has no subtitles" – what can I do?
Change the `No‑caption strategy` to `Import local subtitle file` and upload your own subtitle file.

### AI returns an error when generating the note?
Check that your API key is correct, your internet connection is working, and the selected model supports long‑form text.

### The player cannot load the video?
Some embedded videos may be restricted by the website. Right‑click the player and open the video in a new tab.

## License

MIT License

## Author

[202604]

## 🙏Feedback & Contributions

Please open an issue on GitHub for bug reports or feature requests. Pull requests are welcome.

## 🙏 Acknowledgements

- [Obsidian](https://obsidian.md) for the amazing plugin system
- [youtube-transcript](https://github.com/Kakadu-dev/youtube-transcript) library
- All users of this plugin

---
