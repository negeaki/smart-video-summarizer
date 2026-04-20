import { App, Editor, Notice, Plugin, Modal, TFile, requestUrl, MarkdownView } from 'obsidian';
import { SmartVideoSummarizerSettingTab, SmartVideoSummarizerSettings, DEFAULT_SETTINGS, ApiProvider, HistoryItem } from './settings';
import { fetchTranscript, fetchTranscriptFallback } from './transcript';
import { getApiAdapter, ApiCallOptions } from './api';
import { VIDEO_PLAYER_VIEW_TYPE, VideoPlayerView } from './playerView';

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

export default class SmartVideoSummarizerPlugin extends Plugin {
    settings: SmartVideoSummarizerSettings = DEFAULT_SETTINGS;

    async onload() {
        await this.loadSettings();
        await this.migrateOldSettings();

        this.registerView(VIDEO_PLAYER_VIEW_TYPE, (leaf) => new VideoPlayerView(leaf, this));

        this.addRibbonIcon('video', '智能视频摘要', () => this.openUrlInputModal());
        this.addCommand({ id: 'open-video-summarizer', name: '打开视频摘要', callback: () => this.openUrlInputModal() });
        this.addCommand({
            id: 'summarize-from-selected-url',
            name: '从选中的 URL 生成摘要',
            editorCallback: async (editor: Editor) => {
                const selected = editor.getSelection();
                if (selected && /youtube\.com|youtu\.be|bilibili\.com/.test(selected)) {
                    await this.generateSummaryFromUrl(selected);
                } else {
                    new Notice('请先选中一个有效的视频链接');
                }
            }
        });
        this.addCommand({ id: 'insert-timestamp', name: '插入时间戳', editorCallback: (e: Editor) => this.insertTimestamp(e) });
        this.addCommand({
            id: 'open-video-player',
            name: '打开视频播放器',
            callback: () => this.activatePlayerView()
        });
        this.addSettingTab(new SmartVideoSummarizerSettingTab(this.app, this));
        this.registerEvent(
            this.app.workspace.on('editor-paste', (evt: ClipboardEvent, editor: Editor) => {
                const text = evt.clipboardData?.getData('text');
                if (text && /youtube\.com|youtu\.be|bilibili\.com/.test(text)) {
                    setTimeout(() => void this.generateSummaryFromUrl(text), 100);
                }
            })
        );
        console.debug('Smart Video Summarizer 插件已加载');
    }

    onunload() { console.debug('插件已卸载'); }

    async loadSettings() {
        const saved = await this.loadData() as Partial<SmartVideoSummarizerSettings> | null;
        if (saved) this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    }

    async saveSettings() { await this.saveData(this.settings); }

    private async migrateOldSettings() {
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

    openUrlInputModal() {
        new UrlInputModal(this.app, (url: string) => this.generateSummaryFromUrl(url)).open();
    }

    // ========== 核心流程 ==========
    private async fetchVideoInfo(url: string): Promise<VideoInfo | null> {
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const videoId = this.extractYouTubeId(url);
            if (!videoId) return null;
            try {
                const res = await requestUrl({ url: `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json` });
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

    private async fetchTranscriptWithFallback(url: string): Promise<{ text: string; usedFallback: boolean }> {
        try {
            const transcript = await fetchTranscript(url);
            if (transcript && transcript.length >= 100) {
                return { text: transcript, usedFallback: false };
            }
            throw new Error('No transcript');
        } catch {
            console.warn('字幕获取失败，尝试备选方案');
            const fallback = await fetchTranscriptFallback(url);
            return { text: fallback, usedFallback: true };
        }
    }

    private async saveAndOpenNote(videoInfo: VideoInfo, summary: string, transcript: string): Promise<string> {
        const filePath = await this.saveSummaryToNote(videoInfo, summary, transcript);
        await this.app.workspace.openLinkText(filePath, '', false);
        new Notice('视频摘要生成完成！');
        return filePath;
    }

    async generateSummaryFromUrl(url: string) {
        const loadingNotice = new Notice('正在处理视频，请稍候...', 0);
        try {
            const videoInfo = await this.fetchVideoInfo(url);
            if (!videoInfo) throw new Error('无法获取视频信息');

            const { text: transcript, usedFallback } = await this.fetchTranscriptWithFallback(url);

            if (!transcript || transcript.length < 100) {
                if (this.settings.noCaptionStrategy === 'skip') {
                    throw new Error('该视频没有字幕，已跳过');
                }
                new Notice('视频没有有效字幕，正在使用备选方案...');
            } else {
                new Notice('字幕获取成功，正在生成摘要...');
            }

            const summary = await this.generateAISummary(videoInfo, transcript, usedFallback);
            const filePath = await this.saveAndOpenNote(videoInfo, summary, transcript);
            await this.addToHistory(videoInfo.url, videoInfo.title, videoInfo.platform, filePath);

            if (this.settings.enableMiniPlayer) {
                const player = await this.activatePlayerView();
                if (player) player.loadVideo(url);
            }
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('生成摘要时出错:', error);
            new Notice(`生成失败：${error.message}`);
        } finally {
            loadingNotice.hide();
        }
    }

    extractYouTubeId(url: string): string | null {
        const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    extractBiliBiliId(url: string): string | null {
        const match = url.match(/BV[0-9A-Za-z]{10}/);
        return match ? match[0] : null;
    }

    async generateAISummary(videoInfo: VideoInfo, transcript: string, usedFallback: boolean): Promise<string> {
        const prompt = this.buildPrompt(videoInfo, transcript, usedFallback);
        const provider = this.settings.providers.find(p => p.id === this.settings.activeProviderId);
        if (!provider) throw new Error('No active provider found');
        if (!provider.apiKey) throw new Error(`API key missing for provider: ${provider.name}`);
        const adapter = getApiAdapter(provider);
        const options: ApiCallOptions = {
            temperature: this.settings.temperature,
            maxTokens: this.settings.maxTokens,
        };
        return await adapter.call(prompt, provider, options);
    }

    buildPrompt(videoInfo: VideoInfo, transcript: string, usedFallback: boolean): string {
        let base = `请为以下视频生成一个结构化的摘要笔记。

## 视频信息
- 标题：${videoInfo.title}
- 作者：${videoInfo.author}
- 平台：${videoInfo.platform}
- 链接：${videoInfo.url}

`;
        base += usedFallback || transcript.includes('无法获取字幕') ? `> ⚠️ 注意：该视频没有字幕，以下内容是视频元数据分析结果。\n\n` : `## 视频字幕内容\n\n${transcript.substring(0, 8000)}\n\n`;
        base += `## 输出格式要求
请使用Markdown格式输出，包含以下部分：

### 📌 核心要点
- 列出3-5个视频的核心观点

### 📝 详细摘要
用2-3段话概括视频的主要内容

### 🔑 关键结论
- 列出视频的核心结论

### 📚 技术术语解释
- 解释视频中出现的专业术语

请直接输出Markdown格式的内容，不要有其他说明文字。`;
        return base;
    }

    async saveSummaryToNote(videoInfo: VideoInfo, summary: string, transcript: string): Promise<string> {
        const folder = this.settings.defaultFolder;
        const folderExists = this.app.vault.getAbstractFileByPath(folder);
        if (!folderExists) await this.app.vault.createFolder(folder);
        const safeTitle = videoInfo.title.replace(/[\\/:*?"<>|]/g, '_');
        const fileName = `${folder}/${safeTitle}_摘要.md`;
        const content = `---
title: ${videoInfo.title}
author: ${videoInfo.author}
platform: ${videoInfo.platform}
video_url: ${videoInfo.url}
created: ${new Date().toISOString()}
---

# ${videoInfo.title}

> 视频链接：[${videoInfo.url}](${videoInfo.url})

${summary}

---
## 附录：视频字幕

${transcript.substring(0, 3000)}${transcript.length > 3000 ? '...' : ''}
`;
        const existing = this.app.vault.getAbstractFileByPath(fileName);
        if (existing && existing instanceof TFile) await this.app.vault.modify(existing, content);
        else await this.app.vault.create(fileName, content);
        return fileName;
    }

    insertTimestamp(editor: Editor): void {
        const cursor = editor.getCursor();
        const line = cursor.line;
        const lineEnd = editor.getLine(line).length;
        editor.replaceRange('\n' + `[⏱️ ${new Date().toLocaleTimeString()}]`, { line, ch: lineEnd });
        editor.setCursor({ line: line + 1, ch: 0 });
        new Notice('时间戳已插入');
    }

    async activatePlayerView(): Promise<VideoPlayerView | null> {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE)[0];
        if (!leaf) {
            if (this.settings.playerPosition === 'left') {
                const leftLeaf = workspace.getLeftLeaf(false);
                if (leftLeaf) leaf = leftLeaf;
            } else {
                const rightLeaf = workspace.getRightLeaf(false);
                if (rightLeaf) leaf = rightLeaf;
            }
            if (leaf) {
                await leaf.setViewState({ type: VIDEO_PLAYER_VIEW_TYPE, active: true });
            }
        }
        if (leaf && leaf.view instanceof VideoPlayerView) {
            void workspace.revealLeaf(leaf);
            return leaf.view;
        }
        return null;
    }

    async addToHistory(url: string, title: string, platform: string, summaryPath?: string) {
        const newItem: HistoryItem = { url, title, platform, timestamp: Date.now(), summaryPath };
        this.settings.history = [newItem, ...this.settings.history].slice(0, 20);
        await this.saveSettings();
    }

    async clearHistory() {
        this.settings.history = [];
        await this.saveSettings();
    }

    // ========== 笔记管理方法（供播放器调用） ==========
    async getNotePathForUrl(url: string): Promise<string | null> {
        const folder = this.settings.defaultFolder;
        const folderExists = this.app.vault.getAbstractFileByPath(folder);
        if (!folderExists) return null;

        const videoInfo = await this.fetchVideoInfo(url);
        if (!videoInfo) return null;
        const safeTitle = videoInfo.title.replace(/[\\/:*?"<>|]/g, '_');
        
        // 优先摘要笔记
        const summaryPath = `${folder}/${safeTitle}_摘要.md`;
        if (this.app.vault.getAbstractFileByPath(summaryPath) instanceof TFile) return summaryPath;
        
        // 其次手动笔记
        const notePath = `${folder}/${safeTitle}_笔记.md`;
        if (this.app.vault.getAbstractFileByPath(notePath) instanceof TFile) return notePath;
        
        return null;
    }

    async ensureNoteForUrl(url: string, createIfMissing: boolean): Promise<string | null> {
        const existing = await this.getNotePathForUrl(url);
        if (existing) return existing;
        if (!createIfMissing) return null;
        
        const videoInfo = await this.fetchVideoInfo(url);
        if (!videoInfo) return null;
        const folder = this.settings.defaultFolder;
        if (!(this.app.vault.getAbstractFileByPath(folder) instanceof TFile)) {
            await this.app.vault.createFolder(folder);
        }
        const safeTitle = videoInfo.title.replace(/[\\/:*?"<>|]/g, '_');
        const fileName = `${folder}/${safeTitle}_笔记.md`;
        const content = `---
title: ${videoInfo.title}
author: ${videoInfo.author}
platform: ${videoInfo.platform}
video_url: ${videoInfo.url}
created: ${new Date().toISOString()}
---

# ${videoInfo.title}

> 视频链接：[${videoInfo.url}](${videoInfo.url})

## 随手记

`;
        await this.app.vault.create(fileName, content);
        return fileName;
    }

    async ensureTimestampSectionAndInsert(filePath: string, timestamp: string) {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        let content = await this.app.vault.read(file);
        const heading = '## 时间戳';
        if (!content.includes(heading)) {
            content = content.trimEnd() + '\n\n' + heading + '\n\n';
            await this.app.vault.modify(file, content);
        }
        const lines = content.split('\n');
        let headingIndex = lines.findIndex(line => line.includes(heading));
        if (headingIndex === -1) headingIndex = lines.length - 1;
        let insertLine = headingIndex + 1;
        while (insertLine < lines.length && lines[insertLine].trim() !== '') insertLine++;
        lines.splice(insertLine, 0, timestamp);
        await this.app.vault.modify(file, lines.join('\n'));
        
        await this.app.workspace.openLinkText(filePath, '');
        setTimeout(() => {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view) {
                const editor = view.editor;
                const newLines = editor.getValue().split('\n');
                const tsLine = newLines.findIndex(l => l.includes(timestamp));
                if (tsLine !== -1) editor.setCursor({ line: tsLine, ch: timestamp.length });
                else editor.setCursor({ line: editor.lastLine(), ch: 0 });
            }
        }, 100);
    }

    async ensureJottingSectionAndFocus(filePath: string) {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        let content = await this.app.vault.read(file);
        const heading = '## 随手记';
        if (!content.includes(heading)) {
            content = content.trimEnd() + '\n\n' + heading + '\n\n';
            await this.app.vault.modify(file, content);
        }
        await this.app.workspace.openLinkText(filePath, '');
        setTimeout(() => {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view) {
                const editor = view.editor;
                const lines = editor.getValue().split('\n');
                const idx = lines.findIndex(l => l.includes(heading));
                if (idx !== -1) {
                    let target = idx + 1;
                    if (target >= lines.length) {
                        editor.replaceRange('\n', { line: idx, ch: lines[idx].length });
                    }
                    editor.setCursor({ line: target, ch: 0 });
                } else {
                    editor.setCursor({ line: editor.lastLine(), ch: 0 });
                }
            }
        }, 100);
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

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: '输入视频链接' });
        this.inputEl = contentEl.createEl('input', { type: 'text', placeholder: '输入 YouTube 或 B站 视频链接...', cls: 'video-url-input' });
        const btnContainer = contentEl.createDiv({ cls: 'video-modal-button-container' });
        const submitBtn = btnContainer.createEl('button', { text: '一键总结', cls: 'video-modal-button' });
        const cancelBtn = btnContainer.createEl('button', { text: '取消', cls: 'video-modal-button' });
        submitBtn.onclick = () => {
            if (this.isProcessing) return;
            const url = this.inputEl.value.trim();
            if (url) {
                this.isProcessing = true;
                submitBtn.setText('处理中...');
                this.close();
                this.onSubmit(url)
                    .catch(e => console.error(e))
                    .finally(() => {
                        this.isProcessing = false;
                    });
            }
        };
        cancelBtn.onclick = () => this.close();
        this.inputEl.addEventListener('keypress', e => { if (e.key === 'Enter') submitBtn.click(); });
        this.inputEl.focus();
    }

    onClose() { this.contentEl.empty(); }
}