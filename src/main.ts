// src/main.ts
import { App, Editor, Notice, Plugin, Modal, TFile, requestUrl, MarkdownView, MarkdownRenderChild } from 'obsidian';
import { SmartVideoSummarizerSettingTab, SmartVideoSummarizerSettings, DEFAULT_SETTINGS, ApiProvider, HistoryItem } from './settings';
import { fetchTranscript} from './transcript';
import { getApiAdapter, ApiCallOptions } from './api';
import { VIDEO_PLAYER_VIEW_TYPE, VideoPlayerView } from './playerView';
import {
    VIDEO_URL_PATTERN,
    YOUTUBE_ID_REGEX,
    BILIBILI_ID_REGEX,
    TIMESTAMP_HEADING,
    TIMESTAMP_MARKDOWN_TEMPLATE,
    DEFAULT_FOLDER_NAME,
    MAX_TRANSCRIPT_CHARS,
    MAX_APPENDIX_CHARS,
    NOTICE_MESSAGES,
    RETRY_DELAY,
    MODAL_TITLE,
    INPUT_PLACEHOLDER,
    BUTTON_SUMMARIZE,
    BUTTON_CANCEL,
    BUTTON_PROCESSING,
} from './constants';

// ========== 类型定义 ==========
interface VideoInfo {
    platform: string;
    id: string;
    title: string;
    author: string;
    url: string;
}

interface YouTubeOEmbedResponse {
    title: string;
    author_name: string;
}

interface BiliVideoResponse {
    data: {
        title: string;
        owner: { name: string };
    };
}

interface VideoNoteFrontmatter {
    video_url?: string;
    title?: string;
    author?: string;
    platform?: string;
    created?: string;
}

interface OldSettings {
    aiProvider?: string;
    geminiApiKey?: string;
    grokApiKey?: string;
    deepseekApiKey?: string;
    geminiModel?: string;
    grokModel?: string;
    deepseekModel?: string;
    providers?: unknown;
}

interface SummaryParseResult {
    content: string;
    tags: string[];
}

// ========== 时间戳链接处理器（MarkdownRenderChild） ==========
class TimestampLinkHandler extends MarkdownRenderChild {
    constructor(containerEl: HTMLElement, private plugin: SmartVideoSummarizerPlugin) {
        super(containerEl);
    }

    onload(): void {
        this.processLinks();
    }

    private processLinks(): void {
        const links = this.containerEl.querySelectorAll('.timestamp-link');
        for (let i = 0; i < links.length; i++) {
            const link = links[i] as HTMLElement;
            const timeAttr = link.getAttribute('data-time');
            if (timeAttr) {
                const time = parseInt(timeAttr, 10);
                // 避免 async 回调直接返回 Promise，使用 void 包装
                link.addEventListener('click', (e: MouseEvent) => {
                    e.preventDefault();
                    void (async () => {
                        const player = await this.plugin.activatePlayerView();
                        if (player && typeof player.seekTo === 'function') {
                            player.seekTo(time);
                        } else {
                            new Notice(NOTICE_MESSAGES.PLAYER_NOT_READY);
                        }
                    })();
                });
            }
        }
    }
}

// ========== 主插件类 ==========
export default class SmartVideoSummarizerPlugin extends Plugin {
    settings: SmartVideoSummarizerSettings = DEFAULT_SETTINGS;

    async onload(): Promise<void> {
        await this.loadSettings();
        await this.migrateOldSettings();

        this.registerView(VIDEO_PLAYER_VIEW_TYPE, (leaf) => new VideoPlayerView(leaf, this));

        this.addRibbonIcon('video', '智能视频摘要', () => this.openUrlInputModal());
        
        this.addCommand({ 
            id: 'open-video-summarizer', 
            name: '打开视频摘要', 
            callback: () => this.openUrlInputModal() 
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
            }
        });
        
        this.addCommand({
            id: 'insert-timestamp-in-video-note',
            name: '在当前视频摘要笔记中插入时间戳',
            callback: () => this.insertTimestampInCurrentVideoNote()
        });
        
        this.addCommand({
            id: 'open-video-player',
            name: '打开视频播放器',
            callback: () => this.activatePlayerView()
        });
        
        this.addSettingTab(new SmartVideoSummarizerSettingTab(this.app, this));
        
        // 粘贴自动总结（受设置开关控制）
        this.registerEvent(
            this.app.workspace.on('editor-paste', (evt: ClipboardEvent) => {
                if (!this.settings.autoSummarizeOnPaste) return;
                const text = evt.clipboardData?.getData('text');
                if (text && VIDEO_URL_PATTERN.test(text)) {
                    setTimeout(() => void this.generateSummaryFromUrl(text), 100);
                }
            })
        );
        
        // 注册 Markdown 后处理器
        this.registerMarkdownPostProcessor((el, ctx) => {
            ctx.addChild(new TimestampLinkHandler(el, this));
        });
        
        console.debug('Smart Video Summarizer 插件已加载');
    }

    onunload(): void {
        const leaves = this.app.workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE);
        for (const leaf of leaves) {
            leaf.detach();
        }
        console.debug('插件已卸载，资源已清理');
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

        const newProviders: ApiProvider[] = [];
        if (old.geminiApiKey) {
            newProviders.push({
                id: 'gemini-default',
                name: 'Gemini',
                apiKey: old.geminiApiKey,
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
                model: old.geminiModel || 'gemini-1.5-pro',
                isCustom: false,
            });
        }
        if (old.grokApiKey) {
            newProviders.push({
                id: 'grok-default',
                name: 'Grok',
                apiKey: old.grokApiKey,
                baseUrl: 'https://api.x.ai/v1',
                model: old.grokModel || 'grok-1.5',
                isCustom: false,
            });
        }
        if (old.deepseekApiKey) {
            newProviders.push({
                id: 'deepseek-default',
                name: 'DeepSeek',
                apiKey: old.deepseekApiKey,
                baseUrl: 'https://api.deepseek.com/v1',
                model: old.deepseekModel || 'deepseek-chat',
                isCustom: false,
            });
        }
        if (newProviders.length === 0) newProviders.push(...DEFAULT_SETTINGS.providers);
        
        this.settings.providers = newProviders;
        if (old.aiProvider === 'gemini') this.settings.activeProviderId = 'gemini-default';
        else if (old.aiProvider === 'grok') this.settings.activeProviderId = 'grok-default';
        else if (old.aiProvider === 'deepseek') this.settings.activeProviderId = 'deepseek-default';
        else this.settings.activeProviderId = newProviders[0].id;

        const record = this.settings as unknown as Record<string, unknown>;
        delete record.aiProvider;
        delete record.geminiApiKey;
        delete record.grokApiKey;
        delete record.deepseekApiKey;
        delete record.geminiModel;
        delete record.grokModel;
        delete record.deepseekModel;
        await this.saveSettings();
    }

    openUrlInputModal(): void {
        new UrlInputModal(this.app, (url: string) => this.generateSummaryFromUrl(url)).open();
    }

    // ========== 视频信息获取 ==========
    private async fetchVideoInfo(url: string): Promise<VideoInfo | null> {
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const videoId = this.extractYouTubeId(url);
            if (!videoId) return null;
            try {
                const res = await requestUrl({ 
                    url: `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json` 
                });
                const data = res.json as YouTubeOEmbedResponse;
                return { 
                    platform: 'youtube', 
                    id: videoId, 
                    title: data.title, 
                    author: data.author_name, 
                    url: `https://www.youtube.com/watch?v=${videoId}` 
                };
            } catch {
                return { 
                    platform: 'youtube', 
                    id: videoId, 
                    title: 'YouTube 视频', 
                    author: 'Unknown', 
                    url: `https://www.youtube.com/watch?v=${videoId}` 
                };
            }
        } else if (url.includes('bilibili.com')) {
            const bvid = this.extractBiliBiliId(url);
            if (!bvid) return null;
            try {
                const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
                const resp = await requestUrl({ url: apiUrl });
                const data = resp.json as BiliVideoResponse;
                if (data?.data) {
                    return {
                        platform: 'bilibili',
                        id: bvid,
                        title: data.data.title,
                        author: data.data.owner?.name || 'UP主',
                        url: url
                    };
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
        return (match && match[2]?.length === 11) ? match[2] : null;
    }

    extractBiliBiliId(url: string): string | null {
        const match = url.match(BILIBILI_ID_REGEX);
        return match ? match[0] : null;
    }

    // ========== 字幕获取（整合本地导入） ==========
    private async fetchTranscriptWithFallback(url: string): Promise<{ text: string; usedFallback: boolean }> {
        try {
            const transcript = await fetchTranscript(url);
            if (transcript && transcript.length >= 100) {
                return { text: transcript, usedFallback: false };
            }
            throw new Error('No transcript');
        } catch {
            console.warn('官方字幕获取失败');
        }

        if (this.settings.noCaptionStrategy === 'skip') {
            throw new Error(NOTICE_MESSAGES.NO_VALID_SUBTITLE);
        }
        
        if (this.settings.noCaptionStrategy === 'local') {
            const localText = await this.importLocalSubtitle();
            if (localText && localText.length > 0) {
                return { text: localText, usedFallback: true };
            }
        }
        
        return { text: '【无法获取字幕，将基于元数据生成摘要】', usedFallback: true };
    }

    // ========== 本地字幕导入 ==========
    private async importLocalSubtitle(): Promise<string | null> {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.srt,.vtt,.txt,.ass';
            
            input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) {
                    resolve(null);
                    return;
                }
                try {
                    const content = await file.text();
                    const text = this.parseSubtitleFile(content, file.name);
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
            return content
                .replace(/\d+\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\n/g, '')
                .replace(/\n\n/g, ' ')
                .trim();
        } else if (filename.endsWith('.vtt')) {
            return content
                .replace(/WEBVTT\n\n/g, '')
                .replace(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}\n/g, '')
                .replace(/\n\n/g, ' ')
                .trim();
        } else if (filename.endsWith('.ass')) {
            const lines = content.split('\n');
            const dialogueLines = lines.filter(line => line.startsWith('Dialogue:'));
            // 注意：ASS 的 Dialogue 行格式固定，Text 字段可能包含逗号，使用 slice(9) 取后续所有部分正确。
            return dialogueLines
                .map(line => {
                    const parts = line.split(',');
                    if (parts.length >= 10) {
                        return parts.slice(9).join(',').replace(/\\N/g, ' ');
                    }
                    return '';
                })
                .join(' ')
                .trim();
        } else {
            return content.trim();
        }
    }

    // ========== 核心流程：生成摘要 ==========
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
            
            await this.app.workspace.openLinkText(filePath, '', false);
            new Notice(NOTICE_MESSAGES.GENERATED);

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

    // ========== 长字幕分段摘要 ==========
    private async summarizeLongTranscript(videoInfo: VideoInfo, transcript: string, usedFallback: boolean): Promise<SummaryParseResult> {
        if (transcript.length <= MAX_TRANSCRIPT_CHARS) {
            return await this.generateAISummaryWithTags(videoInfo, transcript, usedFallback);
        }
        
        const chunks = this.splitTranscript(transcript, MAX_TRANSCRIPT_CHARS);
        const chunkSummaries: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
            const partial = await this.generateAISummaryWithTags(videoInfo, chunks[i], usedFallback);
            chunkSummaries.push(partial.content);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
        const combined = chunkSummaries.join('\n\n---\n\n');
        return await this.generateAISummaryWithTags(videoInfo, combined, usedFallback);
    }

    /**
     * 将字幕分割为句子数组，支持中英文标点且不依赖空格。
     * 修复原正则 \s+ 在纯中文无空格时失效的问题。
     */
    private splitTranscript(transcript: string, maxSize: number): string[] {
        // 使用 \s* 匹配零个或多个空白，确保无空格时也能正确分割
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

    // ========== AI 摘要生成（带 tags 解析） ==========
    async generateAISummaryWithTags(videoInfo: VideoInfo, transcript: string, usedFallback: boolean): Promise<SummaryParseResult> {
        const prompt = this.buildPrompt(videoInfo, transcript, usedFallback);
        const provider = this.settings.providers.find(p => p.id === this.settings.activeProviderId);
        if (!provider) throw new Error(NOTICE_MESSAGES.NO_ACTIVE_PROVIDER);
        if (!provider.apiKey) throw new Error(NOTICE_MESSAGES.API_KEY_MISSING(provider.name));
        
        const adapter = getApiAdapter(provider);
        const options: ApiCallOptions = {
            temperature: this.settings.temperature,
            maxTokens: this.settings.maxTokens,
        };
        
        const aiResponse = await adapter.call(prompt, provider, options);
        return this.parseSummaryResponse(aiResponse);
    }

    private parseSummaryResponse(response: string): SummaryParseResult {
        const tagsMatch = response.match(/tags:\s*(#[^\s#]+(?:\s+#[^\s#]+)*)/i);
        let tags: string[] = [];
        let content = response;
        if (tagsMatch) {
            const tagsString = tagsMatch[1];
            tags = tagsString.split(/\s+/).map(t => t.replace(/^#/, ''));
            content = response.replace(/tags:\s*#[^\n]+\n?/i, '');
        }
        content = content.replace(/\n{3,}/g, '\n\n').trim();
        return { content, tags };
    }

    buildPrompt(videoInfo: VideoInfo, transcript: string, usedFallback: boolean): string {
        let base = `请为以下视频生成一个结构化的摘要笔记。

## 视频信息
- 标题：${videoInfo.title}
- 作者：${videoInfo.author}
- 平台：${videoInfo.platform}
- 链接：${videoInfo.url}

`;
        if (usedFallback || transcript.includes('无法获取字幕')) {
            base += `> ⚠️ 注意：该视频没有字幕，以下内容是视频元数据分析结果。\n\n`;
        } else {
            base += `## 视频字幕内容\n\n${transcript.substring(0, MAX_TRANSCRIPT_CHARS)}\n\n`;
        }
        base += `## 输出格式要求
请使用Markdown格式输出，包含以下部分：

### 📌 核心要点
列出3-5个视频的核心观点（每个观点用 [[关键词]] 格式包裹，便于 Obsidian 双向链接）

### 📝 详细摘要
用2-3段话概括视频的主要内容（重要概念用 [[概念名称]] 格式包裹）

### 🔑 关键结论
列出视频的核心结论（每个结论用 [[结论关键词]] 格式包裹）

### 📚 技术术语解释
解释视频中出现的专业术语（每个术语用 [[术语]] 格式包裹）

### 🏷️ 标签建议
请给出 3-5 个标签，格式：tags: #标签1 #标签2 #标签3

请直接输出Markdown格式的内容，不要有其他说明文字。`;
        return base;
    }

    // ========== 笔记保存 ==========
    async saveSummaryToNote(videoInfo: VideoInfo, summary: string, tags: string[], transcript: string): Promise<string> {
        const folder = this.settings.defaultFolder || DEFAULT_FOLDER_NAME;
        const folderExists = this.app.vault.getAbstractFileByPath(folder);
        if (!folderExists) await this.app.vault.createFolder(folder);
        
        const safeTitle = videoInfo.title.replace(/[\\/:*?"<>|]/g, '_');
        const fileName = `${folder}/${safeTitle}_摘要.md`;
        
        const tagsArray = tags.length > 0 ? tags.map(t => `"${t}"`).join(', ') : '';
        const aliases = `"${videoInfo.title}"`;
        
        const content = `---
title: ${videoInfo.title}
author: ${videoInfo.author}
platform: ${videoInfo.platform}
video_url: ${videoInfo.url}
created: ${new Date().toISOString()}
tags: [${tagsArray}]
aliases: [${aliases}]
---

# ${videoInfo.title}

> 视频链接：[${videoInfo.url}](${videoInfo.url})

${summary}

---
## 用户记录区

### 时间戳

### 随手记

---
## 附录：视频字幕

${transcript.substring(0, MAX_APPENDIX_CHARS)}${transcript.length > MAX_APPENDIX_CHARS ? '...' : ''}
`;
        
        const existing = this.app.vault.getAbstractFileByPath(fileName);
        if (existing && existing instanceof TFile) {
            await this.app.vault.modify(existing, content);
        } else {
            await this.app.vault.create(fileName, content);
        }
        return fileName;
    }

    // ========== 笔记管理方法（供播放器调用） ==========
    async getOrCreateSummaryNote(url: string): Promise<string | null> {
        const videoInfo = await this.fetchVideoInfo(url);
        if (!videoInfo) return null;
        
        const folder = this.settings.defaultFolder || DEFAULT_FOLDER_NAME;
        const safeTitle = videoInfo.title.replace(/[\\/:*?"<>|]/g, '_');
        const summaryPath = `${folder}/${safeTitle}_摘要.md`;
        
        if (this.app.vault.getAbstractFileByPath(summaryPath) instanceof TFile) {
            return summaryPath;
        }
        
        const notePath = `${folder}/${safeTitle}_笔记.md`;
        if (this.app.vault.getAbstractFileByPath(notePath) instanceof TFile) {
            return notePath;
        }
        
        if (!(this.app.vault.getAbstractFileByPath(folder) instanceof TFile)) {
            await this.app.vault.createFolder(folder);
        }
        
        const content = `---
title: ${videoInfo.title}
author: ${videoInfo.author}
platform: ${videoInfo.platform}
video_url: ${videoInfo.url}
created: ${new Date().toISOString()}
tags: []
aliases: ["${videoInfo.title}"]
---

# ${videoInfo.title}

> 视频链接：[${videoInfo.url}](${videoInfo.url})

---
## 用户记录区

### 时间戳

### 随手记

`;
        await this.app.vault.create(notePath, content);
        return notePath;
    }

    // ========== 时间戳插入功能 ==========
    async insertTimestampInCurrentVideoNote(): Promise<void> {
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

        const editor = activeView.editor;
        const content = editor.getValue();
        const lines = content.split('\n');
        let headingIndex = lines.findIndex(line => line.includes(TIMESTAMP_HEADING));

        if (headingIndex === -1) {
            new Notice(NOTICE_MESSAGES.TIMESTAMP_HEADING_NOT_FOUND);
            return;
        }

        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        const timestampMarkdown = TIMESTAMP_MARKDOWN_TEMPLATE.replace('{time}', timeStr);

        let insertLine = headingIndex + 1;
        while (insertLine < lines.length && lines[insertLine].trim() !== "") {
            insertLine++;
        }

        editor.replaceRange(timestampMarkdown, { line: insertLine, ch: 0 });
        editor.setCursor({ line: insertLine, ch: timestampMarkdown.length });
        editor.scrollIntoView({ from: editor.getCursor(), to: editor.getCursor() });
        new Notice(NOTICE_MESSAGES.TIMESTAMP_INSERTED);
    }

    // ========== 历史记录 ==========
    async addToHistory(url: string, title: string, platform: string, summaryPath?: string): Promise<void> {
        const newItem: HistoryItem = { url, title, platform, timestamp: Date.now(), summaryPath };
        this.settings.history = [newItem, ...this.settings.history].slice(0, this.settings.maxHistoryCount);
        await this.saveSettings();
    }

    async clearHistory(): Promise<void> {
        this.settings.history = [];
        await this.saveSettings();
    }

    // ========== 播放器管理（完全修复类型错误，保留位置偏好） ==========
    async activatePlayerView(): Promise<VideoPlayerView | null> {
        const { workspace } = this.app;
        // 先查找已存在的播放器叶子
        let leaf = workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE)[0] ?? null;

        if (!leaf) {
            // 定义创建新叶子的工厂函数
            const createLeaf = () => workspace.getLeaf('split', 'vertical');
            // 根据用户设置优先获取侧边栏叶子，若无则创建新叶子
            if (this.settings.playerPosition === 'left') {
                leaf = workspace.getLeftLeaf(false) ?? createLeaf();
            } else {
                leaf = workspace.getRightLeaf(false) ?? createLeaf();
            }
            // 极端情况下仍可能为 null（无可用区域），则放弃创建
            if (!leaf) {
                console.error('无法创建播放器叶子');
                return null;
            }
            await leaf.setViewState({ type: VIDEO_PLAYER_VIEW_TYPE, active: true });
        }

        if (leaf.view instanceof VideoPlayerView) {
            void workspace.revealLeaf(leaf);
            return leaf.view;
        }
        // 视图类型不匹配，记录警告便于调试
        console.warn('播放器叶子存在但视图类型不匹配，预期 VideoPlayerView，实际为', leaf.view);
        return null;
    }
}

// ========== URL 输入模态框 ==========
class UrlInputModal extends Modal {
    private onSubmit: (url: string) => Promise<void>;
    private inputEl!: HTMLInputElement;
    private isProcessing = false;

    constructor(app: App, onSubmit: (url: string) => Promise<void>) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: MODAL_TITLE });
        this.inputEl = contentEl.createEl('input', { 
            type: 'text', 
            placeholder: INPUT_PLACEHOLDER, 
            cls: 'video-url-input' 
        });
        
        const btnContainer = contentEl.createDiv({ cls: 'video-modal-button-container' });
        const submitBtn = btnContainer.createEl('button', { text: BUTTON_SUMMARIZE, cls: 'video-modal-button' });
        const cancelBtn = btnContainer.createEl('button', { text: BUTTON_CANCEL, cls: 'video-modal-button' });
        
        submitBtn.onclick = () => {
            if (this.isProcessing) return;
            const url = this.inputEl.value.trim();
            if (url) {
                this.isProcessing = true;
                submitBtn.setText(BUTTON_PROCESSING);
                this.close();
                this.onSubmit(url)
                    .catch(e => console.error(e))
                    .finally(() => {
                        this.isProcessing = false;
                    });
            }
        };
        
        cancelBtn.onclick = () => this.close();
        this.inputEl.addEventListener('keypress', e => { 
            if (e.key === 'Enter') submitBtn.click(); 
        });
        this.inputEl.focus();
    }

    onClose(): void { 
        this.contentEl.empty(); 
    }
}