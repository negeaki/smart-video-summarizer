Agents Documentation

1. Overview
The Obsidian Smart Video Summarizer plugin automatically generates structured
video summaries. Its AI capabilities are powered by a set of collaborative
agents responsible for transcript analysis, summary generation, tag
extraction, and metadata handling.

2. Agents

2.1 Summarizer Agent
- Receives video metadata (title, author, platform, URL) and transcript text
  (or a fallback note when captions are missing).
- Calls an LLM (Gemini / DeepSeek / custom OpenAI-compatible API) to generate
  a structured Markdown summary.
- Output: five sections --
  Core Points, Detailed Summary, Key Conclusions, Technical Terms, Tag Suggestions.
- Configurable temperature (default 0.7) and max tokens (default 2048).
- Fallback: when the video has no captions, a notice is inserted and the
  summary is based on metadata only.

2.2 Transcript Fetcher Agent
- Attempts to fetch official transcripts from YouTube / Bilibili.
- On failure, follows the user's noCaptionStrategy:
  * metadata: use placeholder text
  * local: prompt user to upload a subtitle file (srt, vtt, ass, txt)
  * skip: abort with an error
- Returns the transcript text and a flag indicating whether a fallback was
  used.

2.3 Video Info Agent
- Extracts platform and video ID from the user-provided URL.
- Fetches title and author via oEmbed (YouTube) or Bilibili API.
- Falls back to basic placeholders if APIs fail.

2.4 Timestamp Link Handler Agent
- Parses Markdown timestamp links (e.g. [📌 12:34](https://...)).
- On click, opens the built-in video player and seeks to the specified time.

3. Workflow

User enters URL
      │
      ▼
 UrlInputModal
      │
      ▼
 Video Info Agent  --> metadata (title, author, ...)
      │
      ▼
 Transcript Fetcher Agent --> transcript or fallback
      │
      ├─ (length <= 8000) --> Summarizer Agent directly
      └─ (long) --> split into chunks --> Summarizer Agent per chunk
                       │
                       ▼
                 merge partial summaries --> Summarizer Agent final pass
                       │
                       ▼
                 Save note (YYYY-MM-DD_Author_custom.md)
                       │
                       ▼
                 Optionally open mini player

4. Prompt Template (core structure)

You are helping to generate a structured video summary.

## Video info
- Title: {{title}}
- Author: {{author}}
- Platform: {{platform}}
- URL: {{url}}

{{#if usedFallback}}
> Warning: No captions available; this summary is based on metadata.
{{else}}
## Transcript
{{transcript}}
{{/if}}

## Output format
### Core Points (3-5 key ideas, wrap each in [[keyword]])
### Detailed Summary (2-3 paragraphs, wrap important concepts in [[concept]])
### Key Conclusions (wrap each in [[conclusion keyword]])
### Technical Terms (explain terms, wrap each in [[term]])
### Tag Suggestions
tags: #tag1 #tag2 #tag3

Output only the Markdown content, no extra commentary.

5. Long Transcript Handling
- Transcripts longer than 8000 characters are split at sentence boundaries.
- Each chunk is summarized individually.
- All partial summaries are merged and re-summarized for the final note.

6. Extensibility
- The adapter pattern (getApiAdapter) allows adding any OpenAI-compatible API.
- Agents can be replaced or extended for specific tasks (e.g. chapter
  detection, keyword extraction).
- Local LLMs (e.g. Ollama) can be integrated via a custom adapter.
- Future: workflow engine could conditionally activate different agents.

7. Security Note
- API keys are stored in plain text inside data.json.
- Avoid sharing that file and consider excluding .obsidian from cloud sync if
  privacy is a concern.