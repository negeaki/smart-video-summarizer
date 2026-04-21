# Smart Video Summarizer for Obsidian

## Project overview
Obsidian plugin that generates AI summaries for YouTube and Bilibili videos. Paste a link → fetches captions → calls LLM → creates structured note with embedded video player, timestamp area, and history.

## Key features
- One-click summarization (ribbon icon, command, or paste trigger)
- Supports YouTube and Bilibili (captions via youtube-transcript + Bili API)
- Multiple AI providers: Gemini, DeepSeek, OpenAI-compatible (configurable API key, base URL, model)
- Built-in sidebar video player (left/right position, iframe embed)
- Insert timestamp in video summary notes (requires frontmatter `video_url`)
- No-caption strategies: metadata only, import local subtitle file (.srt/.vtt/.ass), or skip
- History panel (max entries, open note, replay video, delete)
- All generated notes stored in configurable folder (default "Video Summaries")

## Technical notes
- No `any`, no inline styles, no unused variables – follows Obsidian plugin standards
- Frontmatter used to identify video notes (`video_url` field)
- Commands (IDs):
  - `open-video-summarizer`
  - `summarize-from-selected-url`
  - `insert-timestamp-in-video-note`
  - `open-video-player`
- Settings: providers, temperature, maxTokens, enableMiniPlayer, playerPosition, noCaptionStrategy, defaultFolder, maxHistoryCount, history

## User guidance
- User must obtain an API key (e.g., from Google AI Studio for Gemini)
- After installation, configure API key and provider in settings
- Summarize a video by clicking the video ribbon icon, or by pasting a YouTube/Bilibili link into a note
- Generated notes contain structured summary and user area; timestamps can be inserted via command/hotkey
- The built-in player opens automatically (if enabled) and can be positioned left/right

## Development
- Written in TypeScript, built with esbuild
- Source files: main.ts, settings.ts, api.ts, playerView.ts, transcript.ts
- Dependencies: obsidian, youtube-transcript