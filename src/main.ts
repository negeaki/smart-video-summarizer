import {
    App, Editor, Notice, Plugin, TFile, requestUrl,
    MarkdownView, MarkdownRenderChild, WorkspaceLeaf,
} from 'obsidian';
import { SmartVideoSummarizerSettingTab, SmartVideoSummarizerSettings, DEFAULT_SETTINGS } from './settings';
import { fetchTranscript } from './transcript';
import { getApiAdapter, ApiCallOptions, ExtendedApiProvider } from './api';
import { VIDEO_PLAYER_VIEW_TYPE, VideoPlayerView } from './playerView';
import {
    VIDEO_URL_PATTERN, YOUTUBE_ID_REGEX, BILIBILI_ID_REGEX,
    TIMESTAMP_HEADING, TIMESTAMP_MARKDOWN_TEMPLATE,
    DEFAULT_FOLDER_NAME, MAX_TRANSCRIPT_CHARS, MAX_APPENDIX_CHARS,
    NOTICE_MESSAGES, RETRY_DELAY,
} from './constants';
import { UrlInputModal, TimestampInputModal } from './modals';
import { timestampEditExtension, TimestampLinkHandler } from './timestampHandler';

// ---------- 类型定义 ----------
interface VideoInfo {
    platform: string; id: string; title: string; author: string; url: string;
}
interface YouTubeOEmbedResponse { title: string; author_name: string; }
interface BiliVideoResponse { data: { title: string; owner: { name: string }; }; }
interface VideoNoteFrontmatter {
    video_url?: string; title?: string; author?: string; platform?: string; created?: string;
}
interface SummaryParseResult { content: string; tags: string[]; }
interface OldSettings {
    aiProvider?: string; geminiApiKey?: string; grokApiKey?: string; deepseekApiKey?: string;
    geminiModel?: string; grokModel?: string; deepseekModel?: string; providers?: unknown;
}

export default class SmartVideoSummarizerPlugin extends Plugin {
    settings: SmartVideoSummarizerSettings = DEFAULT_SETTINGS;
    private ribbonIconEl?: HTMLElement;

    async onload(): Promise<void> {
        await this.loadSettings();
        await this.migrateOldSettings();

        // 注册播放器视图
        this.registerView(VIDEO_PLAYER_VIEW_TYPE, leaf => new VideoPlayerView(leaf, this));

        // 功能区图标
        this.ribbonIconEl = this.addRibbonIcon('video', '智能视频摘要', () => this.openUrlInputModal());

        // 命令
        this.addCommand({
            id: 'open-video-summarizer',
            name: '打开视频摘要',
            callback: () => this.openUrlInputModal(),
        });
        this.addCommand({
            id: 'summarize-from-selected-url',
            name: '从选中的 URL 生成摘要',
            editorCallback: async (editor: Editor) => {
                const selected = editor.getSelection();
                if (selected && VIDEO_URL_PATTERN.test(selected)) {
                    await this.generateSummaryFromUrl(selected);
                } else {
                    new Notice(NOTICE_MESSAGES.SELECT_VALID_URL);
                }
            },
        });
        this.addCommand({
            id: 'insert-video-timestamp',
            name: '在当前视频笔记中插入视频时间戳',
            callback: () => this.insertVideoTimestamp(),
        });
        this.addCommand({
            id: 'open-video-player-for-current-note',
            name: '在当前笔记对应的播放器中加载视频',
            callback: () => this.loadVideoInPlayerFromCurrentNote(),
        });
        this.addCommand({
            id: 'show-video-player',
            name: '显示视频播放器面板',
            callback: () => this.activatePlayerView(),
        });

        // 设置选项卡
        this.addSettingTab(new SmartVideoSummarizerSettingTab(this.app, this));

        // 注册阅读模式处理器
        this.registerMarkdownPostProcessor((el, ctx) => {
            ctx.addChild(new TimestampLinkHandler(el, this));
        });

        // 注册编辑器扩展
        this.registerEditorExtension(timestampEditExtension(this));

        console.debug('Smart Video Summarizer 插件已加载');
    }

    onunload(): void {
        this.app.workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE).forEach(leaf => leaf.detach());
    }

    async loadSettings(): Promise<void> {
        const saved = await this.loadData() as Partial<SmartVideoSummarizerSettings> | null;
        if (saved) this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    private async migrateOldSettings(): Promise<void> {
        const old = this.settings as unknown as OldSettings;
        if (old.providers !== undefined || old.aiProvider === undefined) return;

        const newProviders: ExtendedApiProvider[] = [];
        if (old.geminiApiKey) newProviders.push({
            id: 'gemini-default', name: 'Gemini', apiKey: old.geminiApiKey,
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
            model: old.geminiModel || 'gemini-1.5-pro', isCustom: false
        });
        if (old.grokApiKey) newProviders.push({
            id: 'grok-default', name: 'Grok', apiKey: old.grokApiKey,
            baseUrl: 'https://api.x.ai/v1',
            model: old.grokModel || 'grok-1.5', isCustom: false
        });
        if (old.deepseekApiKey) newProviders.push({
            id: 'deepseek-default', name: 'DeepSeek', apiKey: old.deepseekApiKey,
            baseUrl: 'https://api.deepseek.com/v1',
            model: old.deepseekModel || 'deepseek-chat', isCustom: false
        });
        if (newProviders.length === 0) newProviders.push(...DEFAULT_SETTINGS.providers);

        this.settings.providers = newProviders;
        if (old.aiProvider === 'gemini') this.settings.activeProviderId = 'gemini-default';
        else if (old.aiProvider === 'grok') this.settings.activeProviderId = 'grok-default';
        else if (old.aiProvider === 'deepseek') this.settings.activeProviderId = 'deepseek-default';
        else this.settings.activeProviderId = newProviders[0].id;

        // 清理旧字段
        delete (this.settings as any).aiProvider;
        delete (this.settings as any).geminiApiKey;
        delete (this.settings as any).grokApiKey;
        delete (this.settings as any).deepseekApiKey;
        delete (this.settings as any).geminiModel;
        delete (this.settings as any).grokModel;
        delete (this.settings as any).deepseekModel;
        await this.saveSettings();
    }

    openUrlInputModal(): void {
        new UrlInputModal(this.app, (url: string) => this.generateSummaryFromUrl(url)).open();
    }

    // ---------- 视频信息获取 ----------
    private async fetchVideoInfo(url: string): Promise<VideoInfo | null> {
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const videoId = this.extractYouTubeId(url);
            if (!videoId) return null;
            try {
                const res = await requestUrl({
                    url: `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
                });
                const data = res.json as YouTubeOEmbedResponse;
                return { platform: 'youtube', id: videoId, title: data.title, author: data.author_name, url: `https://www.youtube.com/watch?v=${videoId}` };
            } catch {
                return { platform: 'youtube', id: videoId, title: 'YouTube 视频', author: 'Unknown', url: `https://www.youtube.com/watch?v=${videoId}` };
            }
        } else if (url.includes('bilibili.com')) {
            const bvid = this.extractBiliBiliId(url);
            if (!bvid) return null;
            try {
                const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
                const resp = await requestUrl({ url: apiUrl });
                const data = resp.json as BiliVideoResponse;
                if (data?.data) {
                    return { platform: 'bilibili', id: bvid, title: data.data.title, author: data.data.owner?.name || 'UP主', url };
                }
                return { platform: 'bilibili', id: bvid, title: 'B站视频', author: 'UP主', url };
            } catch {
                return { platform: 'bilibili', id: bvid, title: 'B站视频', author: 'UP主', url };
            }
        }
        return null;
    }

    extractYouTubeId(url: string): string | null {
        const match = url.match(YOUTUBE_ID_REGEX);
        return match?.[2]?.length === 11 ? match[2] : null;
    }

    extractBiliBiliId(url: string): string | null {
        const match = url.match(BILIBILI_ID_REGEX);
        return match ? match[0] : null;
    }

    // ---------- 字幕获取（含降级） ----------
    private async fetchTranscriptWithFallback(url: string): Promise<{ text: string; usedFallback: boolean }> {
        try {
            const transcript = await fetchTranscript(url);
            if (transcript && transcript.length >= 100) return { text: transcript, usedFallback: false };
            throw new Error('No transcript');
        } catch { 
            console.warn('官方字幕获取失败，尝试备选方案');
        }

        if (this.settings.noCaptionStrategy === 'skip') {
            throw new Error(NOTICE_MESSAGES.NO_VALID_SUBTITLE);
        }

        if (this.settings.noCaptionStrategy === 'local') {
            const localText = await this.importLocalSubtitle();
            if (localText && localText.length > 0) return { text: localText, usedFallback: true };
        }

        // 最后降级为元数据模式
        return { text: '【无法获取字幕，将基于元数据生成摘要】', usedFallback: true };
    }

    private async importLocalSubtitle(): Promise<string | null> {
        return new Promise(resolve => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.srt,.vtt,.txt,.ass';
            input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) { resolve(null); return; }
                try {
                    const text = this.parseSubtitleFile(await file.text(), file.name);
                    resolve(text);
                } catch {
                    new Notice(NOTICE_MESSAGES.LOCAL_SUBTITLE_FAILED);
                    resolve(null);
                }
            };
            input.click();
        });
    }

    private parseSubtitleFile(content: string, filename: string): string {
        if (filename.endsWith('.srt')) {
            return content.replace(/\d+\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\n/g, '')
                          .replace(/\n\n/g, ' ').trim();
        }
        if (filename.endsWith('.vtt')) {
            return content.replace(/WEBVTT\n\n/g, '')
                          .replace(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}\n/g, '')
                          .replace(/\n\n/g, ' ').trim();
        }
        if (filename.endsWith('.ass')) {
            const dialogueLines = content.split('\n').filter(line => line.startsWith('Dialogue:'));
            return dialogueLines.map(line => {
                const parts = line.split(',');
                return parts.length >= 10 ? parts.slice(9).join(',').replace(/\\N/g, ' ') : '';
            }).join(' ').trim();
        }
        return content.trim();
    }

    // ---------- 摘要生成 ----------
    async generateSummaryFromUrl(url: string): Promise<void> {
        const loadingNotice = new Notice(NOTICE_MESSAGES.GENERATING, 0);
        try {
            const videoInfo = await this.fetchVideoInfo(url);
            if (!videoInfo) throw new Error(NOTICE_MESSAGES.NO_VIDEO_INFO);

            const { text: transcript, usedFallback } = await this.fetchTranscriptWithFallback(url);
            if (!transcript || (transcript.length < 100 && !transcript.includes('【无法获取字幕】'))) {
                new Notice(NOTICE_MESSAGES.NO_CAPTION_FALLBACK);
            }

            const summaryResult = await this.summarizeLongTranscript(videoInfo, transcript, usedFallback);
            const filePath = await this.saveSummaryToNote(videoInfo, summaryResult.content, summaryResult.tags, transcript);
            await this.addToHistory(videoInfo.url, videoInfo.title, videoInfo.platform, filePath);

            // 自动打开生成的笔记
            await this.app.workspace.openLinkText(filePath, '', false);
            await new Promise(resolve => setTimeout(resolve, 200));

            // 光标定位到时间戳区域
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView) {
                const editor = activeView.editor;
                const lines = editor.getValue().split('\n');
                const headingIndex = lines.findIndex(line => line.includes(TIMESTAMP_HEADING));
                if (headingIndex !== -1) {
                    let cursorLine = headingIndex + 1;
                    while (cursorLine < lines.length && lines[cursorLine].trim() !== '') cursorLine++;
                    editor.setCursor({ line: cursorLine, ch: 0 });
                    editor.scrollIntoView({ from: editor.getCursor(), to: editor.getCursor() });
                }
            }

            new Notice(NOTICE_MESSAGES.GENERATED);

            // 自动打开迷你播放器（如果开启）
            if (this.settings.enableMiniPlayer) {
                const player = await this.activatePlayerView();
                if (player) player.loadVideo(url);
            }
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('生成摘要时出错:', error);
            new Notice(NOTICE_MESSAGES.GENERATION_FAILED(error.message));
        } finally {
            loadingNotice.hide();
        }
    }

    private async summarizeLongTranscript(videoInfo: VideoInfo, transcript: string, usedFallback: boolean): Promise<SummaryParseResult> {
        if (transcript.length <= MAX_TRANSCRIPT_CHARS) {
            return await this.generateAISummaryWithTags(videoInfo, transcript, usedFallback);
        }
        // 长文本分段总结
        const chunks = this.splitTranscript(transcript, MAX_TRANSCRIPT_CHARS);
        const chunkSummaries: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
            const partial = await this.generateAISummaryWithTags(videoInfo, chunks[i], usedFallback);
            chunkSummaries.push(partial.content);
            if (i < chunks.length - 1) await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
        return await this.generateAISummaryWithTags(videoInfo, chunkSummaries.join('\n\n---\n\n'), usedFallback);
    }

    private splitTranscript(transcript: string, maxSize: number): string[] {
        const sentences = transcript.split(/(?<=[.!?。！？])\s*/);
        const chunks: string[] = [];
        let current = '';
        for (const sent of sentences) {
            if ((current + sent).length > maxSize) {
                if (current) chunks.push(current);
                current = sent;
            } else {
                current += (current ? ' ' : '') + sent;
            }
        }
        if (current) chunks.push(current);
        return chunks;
    }

    async generateAISummaryWithTags(videoInfo: VideoInfo, transcript: string, usedFallback: boolean): Promise<SummaryParseResult> {
        const prompt = this.buildPrompt(videoInfo, transcript, usedFallback);
        const provider = this.settings.providers.find(p => p.id === this.settings.activeProviderId);
        if (!provider) throw new Error(NOTICE_MESSAGES.NO_ACTIVE_PROVIDER);
        if (!provider.apiKey) throw new Error(NOTICE_MESSAGES.API_KEY_MISSING(provider.name));

        const adapter = getApiAdapter(provider);
        const options: ApiCallOptions = { temperature: this.settings.temperature, maxTokens: this.settings.maxTokens };
        const aiResponse = await adapter.call(prompt, provider, options);
        return this.parseSummaryResponse(aiResponse);
    }

    private parseSummaryResponse(response: string): SummaryParseResult {
        const tagsMatch = response.match(/tags:\s*(#[^\s#]+(?:\s+#[^\s#]+)*)/i);
        let tags: string[] = [];
        let content = response;
        if (tagsMatch) {
            tags = tagsMatch[1].split(/\s+/).map(t => t.replace(/^#/, ''));
            content = response.replace(/tags:\s*#[^\n]+\n?/i, '');
        }
        content = content.replace(/\n{3,}/g, '\n\n').trim();
        return { content, tags };
    }

    buildPrompt(videoInfo: VideoInfo, transcript: string, usedFallback: boolean): string {
        let base = `请为以下视频生成一个结构化的摘要笔记。\n\n## 视频信息\n- 标题：${videoInfo.title}\n- 作者：${videoInfo.author}\n- 平台：${videoInfo.platform}\n- 链接：${videoInfo.url}\n\n`;
        if (usedFallback || transcript.includes('无法获取字幕')) {
            base += `> ⚠️ 注意：该视频没有字幕，以下内容是视频元数据分析结果。\n\n`;
        } else {
            base += `## 视频字幕内容\n\n${transcript.substring(0, MAX_TRANSCRIPT_CHARS)}\n\n`;
        }
        base += `## 输出格式要求\n请使用Markdown格式输出，包含以下部分：\n\n### 📌 核心要点\n列出3-5个视频的核心观点（每个观点用 [[关键词]] 格式包裹）\n\n### 📝 详细摘要\n用2-3段话概括视频的主要内容（重要概念用 [[概念名称]] 格式包裹）\n\n### 🔑 关键结论\n列出视频的核心结论（每个结论用 [[结论关键词]] 格式包裹）\n\n### 📚 专业术语\n解释视频中出现的专业术语（每个术语用 [[术语]] 格式包裹）\n\n### 🏷️ 标签建议\n请给出 3-5 个标签，格式：tags: #标签1 #标签2 #标签3\n\n请直接输出Markdown格式的内容，不要有其他说明文字。`;
        return base;
    }

    async saveSummaryToNote(videoInfo: VideoInfo, summary: string, tags: string[], transcript: string): Promise<string> {
        const folder = DEFAULT_FOLDER_NAME;
        if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);

        const safeTitle = videoInfo.title.replace(/[\\/:*?"<>|]/g, '_');
        const fileName = `${folder}/${safeTitle}_摘要.md`;

        const tagsArray = tags.length > 0 ? tags.map(t => `"${t}"`).join(', ') : '';
        const content = [
            '---',
            `title: ${videoInfo.title}`,
            `author: ${videoInfo.author}`,
            `platform: ${videoInfo.platform}`,
            `video_url: ${videoInfo.url}`,
            `created: ${new Date().toISOString()}`,
            `tags: [${tagsArray}]`,
            `aliases: ["${videoInfo.title}"]`,
            '---',
            '',
            `# ${videoInfo.title}`,
            '',
            `> 视频链接：[${videoInfo.url}](${videoInfo.url})`,
            '',
            summary,
            '',
            '---',
            '## 火花记录',
            '',
            '### 时间戳',
            '', // 空行方便直接插入时间戳
            '---',
            '## 附录：视频字幕',
            '',
            transcript.substring(0, MAX_APPENDIX_CHARS) + (transcript.length > MAX_APPENDIX_CHARS ? '...' : ''),
        ].join('\n');

        const existing = this.app.vault.getAbstractFileByPath(fileName);
        if (existing instanceof TFile) {
            await this.app.vault.modify(existing, content);
        } else {
            await this.app.vault.create(fileName, content);
        }
        return fileName;
    }

    async getOrCreateSummaryNote(url: string): Promise<string | null> {
        const videoInfo = await this.fetchVideoInfo(url);
        if (!videoInfo) return null;

        const folder = DEFAULT_FOLDER_NAME;
        const safeTitle = videoInfo.title.replace(/[\\/:*?"<>|]/g, '_');
        const summaryPath = `${folder}/${safeTitle}_摘要.md`;
        if (this.app.vault.getAbstractFileByPath(summaryPath) instanceof TFile) return summaryPath;

        const notePath = `${folder}/${safeTitle}_笔记.md`;
        if (this.app.vault.getAbstractFileByPath(notePath) instanceof TFile) return notePath;

        if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
        const content = `---\ntitle: ${videoInfo.title}\nauthor: ${videoInfo.author}\nplatform: ${videoInfo.platform}\nvideo_url: ${videoInfo.url}\ncreated: ${new Date().toISOString()}\ntags: []\naliases: ["${videoInfo.title}"]\n---\n\n# ${videoInfo.title}\n\n> 视频链接：[${videoInfo.url}](${videoInfo.url})\n\n---\n## 火花记录\n\n### 时间戳\n\n`;
        await this.app.vault.create(notePath, content);
        return notePath;
    }

    // ---------- 时间戳插入 ----------
    async insertVideoTimestamp(): Promise<void> {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            new Notice(NOTICE_MESSAGES.OPEN_VIDEO_NOTE_FIRST);
            return;
        }
        const file = activeView.file;
        if (!file) return;

        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter as VideoNoteFrontmatter | undefined;
        const videoUrl = frontmatter?.video_url;
        if (!videoUrl) {
            new Notice(NOTICE_MESSAGES.NOT_VIDEO_NOTE);
            return;
        }

        let currentSeconds: number | null = null;
        const player = await this.getExistingPlayerView();
        if (player) currentSeconds = await player.getCurrentTime();

        if (currentSeconds === null) {
            new TimestampInputModal(this.app, (seconds: number) => {
                this.insertTimestampAtCursor(activeView.editor, videoUrl, seconds);
            }).open();
        } else {
            this.insertTimestampAtCursor(activeView.editor, videoUrl, currentSeconds);
        }
    }

    private insertTimestampAtCursor(editor: Editor, videoUrl: string, seconds: number): void {
        const timeDisplay = this.formatTimeFromSeconds(seconds);
        const linkText = `[${TIMESTAMP_MARKDOWN_TEMPLATE.replace('{time}', timeDisplay)}](${videoUrl}?t=${seconds})`;
        const cursor = editor.getCursor();
        editor.replaceRange(linkText, cursor);
        new Notice(`已插入时间戳 ${timeDisplay}`);
    }

    private formatTimeFromSeconds(totalSeconds: number): string {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // ---------- 播放器相关 ----------
    async loadVideoInPlayerFromCurrentNote(): Promise<void> {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            new Notice(NOTICE_MESSAGES.OPEN_VIDEO_NOTE_FIRST);
            return;
        }
        const file = activeView.file;
        if (!file) return;
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter as VideoNoteFrontmatter | undefined;
        const videoUrl = frontmatter?.video_url;
        if (!videoUrl) {
            new Notice(NOTICE_MESSAGES.NOT_VIDEO_NOTE);
            return;
        }

        const player = await this.activatePlayerView();
        if (player) {
            player.loadVideo(videoUrl);
            new Notice(`已加载视频: ${frontmatter?.title ?? '视频'}`);
        } else {
            new Notice(NOTICE_MESSAGES.PLAYER_NOT_READY);
        }
    }

    async activatePlayerView(): Promise<VideoPlayerView | null> {
        const { workspace } = this.app;
        const existingLeaves = workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE);
        if (existingLeaves.length > 0) {
            await workspace.revealLeaf(existingLeaves[0]);
            const view = existingLeaves[0].view;
            return view instanceof VideoPlayerView ? view : null;
        }

        let leaf: WorkspaceLeaf | null = null;
        const pos = this.settings.playerPosition;
        if (pos === 'sidebar-left') leaf = workspace.getLeftLeaf(false);
        else if (pos === 'sidebar-right') leaf = workspace.getRightLeaf(false);
        else if (pos === 'center') leaf = workspace.getLeaf('tab');
        else leaf = workspace.getRightLeaf(false);

        if (!leaf) leaf = workspace.getLeaf('tab');
        if (!leaf) return null;

        await leaf.setViewState({ type: VIDEO_PLAYER_VIEW_TYPE, active: true });
        await workspace.revealLeaf(leaf);
        const view = leaf.view;
        return view instanceof VideoPlayerView ? view : null;
    }

    async handleTimestampClick(videoUrl: string, seconds: number): Promise<void> {
        const player = await this.activatePlayerView();
        if (!player) {
            new Notice(NOTICE_MESSAGES.PLAYER_NOT_READY);
            return;
        }
        if (player.currentUrl !== videoUrl) {
            player.loadVideo(videoUrl);
            try { await player.waitForLoad(); } catch {
                new Notice(NOTICE_MESSAGES.PLAYER_NOT_READY);
                return;
            }
        }
        await player.seekTo(seconds);
    }

    private async getExistingPlayerView(): Promise<VideoPlayerView | null> {
        const leaves = this.app.workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE);
        if (leaves.length === 0) return null;
        const view = leaves[0].view;
        return view instanceof VideoPlayerView ? view : null;
    }

    // ---------- 历史记录 ----------
    async addToHistory(url: string, title: string, platform: string, summaryPath?: string): Promise<void> {
        const newItem = { url, title, platform, timestamp: Date.now(), summaryPath };
        this.settings.history = [newItem, ...this.settings.history].slice(0, this.settings.maxHistoryCount);
        await this.saveSettings();
    }
}