========================================
Smart Video Summarizer - Obsidian Plugin
========================================

【Description】
This plugin automatically fetches subtitles from YouTube or Bilibili videos, calls an AI model (supports Gemini, DeepSeek, and any OpenAI‑compatible API) to generate a structured summary including key points, detailed summary, conclusions, and term explanations. The summary is saved as a Markdown note. It also features an embedded player, timestamp insertion, and a quick note‑taking section.

【Features】
- One‑click summarization: paste a video URL, auto‑fetch subtitles, and generate a structured note.
- Supports YouTube (including short links) and Bilibili (BV ID).
- Multiple AI providers: built‑in Gemini and DeepSeek; add custom OpenAI‑compatible providers (e.g., Groq, Ollama).
- Embedded video player in Obsidian sidebar for watching while taking notes.
- Timestamp insertion: adds current system time to your note (extensible to video progress timestamps).
- Quick note (“Jotting”): opens/creates a dedicated note and places the cursor under the “## Jotting” heading.
- History: automatically saves the last 20 summaries; reopen with one click.
- No‑caption handling: fallback to metadata analysis or skip.
- Fully local: API calls go directly from your machine to the provider; no intermediate server.

【Installation】
1. Download the latest release from GitHub Releases.
2. Unzip and copy the folder to `<your-vault>/.obsidian/plugins/`.
3. Restart Obsidian and enable the plugin in Settings → Community plugins.
(Will be submitted to Obsidian community store soon.)

【Configuration】
1. Go to Settings → Community plugins → Smart Video Summarizer → gear icon.
2. Under “API providers”:
   - Built‑in providers: Gemini, DeepSeek (enter your API keys).
   - Click “Add provider” to add custom providers (e.g., OpenAI, Ollama).
   - While editing a provider, click “Test” to verify the connection.
3. Select the active provider from “Active AI provider”.
4. Adjust summary parameters: Temperature, Max tokens.
5. Set video player options: “Enable mini player”, “Player position” (left/right sidebar).
6. Set no‑caption strategy: “Use only metadata” / “Skip this video”.

【How to Use】
1. Click the video icon in the left ribbon, paste a YouTube or Bilibili URL, then click “Summarize”.
2. Wait 10‑30 seconds. The plugin will:
   - Fetch subtitles (if available)
   - Call the AI to generate a summary
   - Automatically open the new note and focus on it
   - Automatically open the sidebar player (if enabled)
3. After reading the summary, if you want to watch the video:
   - Manually click the play button on the player (video does not auto‑play)
   - Click the “⏱️” button to insert a timestamp (creates a “## Timestamp” section and appends current time)
   - Click the “📝” button to open the “Jotting” section – the cursor will be placed under “## Jotting” for immediate note‑taking
4. To reopen the player after closing, use the command palette “Open video player” (it will not auto‑load a video; you need to reopen from history).

【Getting API Keys】
- Gemini: visit https://aistudio.google.com/, sign in and click “Get API Key”.
- DeepSeek: visit https://platform.deepseek.com/, sign up and get your API key.
- OpenAI: visit https://platform.openai.com/api-keys, then add as a custom provider.

【FAQ】
Q: “No transcript found”?
A: The video may lack subtitles. Try another video or change the “No caption strategy” to “Use only metadata”.

Q: API test connection fails?
A: Check the Base URL and API Key. For local servers (e.g., Ollama), ensure the service is running and the port is correct.

Q: Player does not load video automatically?
A: Ensure “Enable mini player” is on and the player position matches your Obsidian sidebar. The video will load after generating a summary.

【Developer】
- GitHub: https://github.com/negeaki/smart-video-summarizer
- Issues: please report on GitHub Issues.

【License】
MIT License
========================================