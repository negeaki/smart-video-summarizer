// playerView.ts
import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import type SmartVideoSummarizerPlugin from './main';
import {
    YOUTUBE_ID_REGEX, BILIBILI_ID_REGEX, YOUTUBE_EMBED_BASE, YOUTUBE_EMBED_PARAMS,
    BILIBILI_EMBED_BASE, BILIBILI_EMBED_PARAMS, NOTICE_MESSAGES,
} from './constants';

export const VIDEO_PLAYER_VIEW_TYPE = 'video-player-view';

interface YouTubePlayerMessage { event?: string; info?: { currentTime?: number; duration?: number; }; }
function isYouTubeInfoDeliveryMessage(data: unknown): data is YouTubePlayerMessage {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    if (msg.event !== 'infoDelivery') return false;
    const info = msg.info;
    if (typeof info !== 'object' || info === null) return false;
    const infoObj = info as Record<string, unknown>;
    return typeof infoObj.currentTime === 'number';
}

export class VideoPlayerView extends ItemView {
    plugin: SmartVideoSummarizerPlugin;
    private iframe: HTMLIFrameElement | null = null;
    public currentUrl = '';
    private currentPlatform: 'youtube' | 'bilibili' | null = null;
    private pendingTimeResolver: ((time: number | null) => void) | null = null;
    private boundMessageHandler = this.handleYouTubeMessage.bind(this);
    private lastKnownTime = 0;
    private iframeLoadResolve: (() => void) | null = null;
    private iframeLoadPromise: Promise<void> | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: SmartVideoSummarizerPlugin) { super(leaf); this.plugin = plugin; }
    getViewType(): string { return VIDEO_PLAYER_VIEW_TYPE; }
    getDisplayText(): string { return '视频播放器'; }
    getIcon(): string { return 'video'; }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1]; container.empty(); container.addClass('video-player-container');
        const controls = container.createDiv({ cls: 'player-controls' });
        controls.createDiv({ cls: 'player-controls-spacer' });
        const screenshotBtn = controls.createEl('button', { text: '📸', cls: 'player-btn' });
        screenshotBtn.setAttribute('aria-label', '截图提示'); screenshotBtn.onclick = (): void => { new Notice('请使用系统截图工具（Win+Shift+S）截取画面，然后粘贴到笔记中'); void this.openCurrentSummaryNote(); };
        const closeBtn = controls.createEl('button', { text: '❌', cls: 'player-btn' });
        closeBtn.setAttribute('aria-label', '关闭播放器'); closeBtn.onclick = (): void => this.leaf.detach();
        const playerWrapper = container.createDiv({ cls: 'player-wrapper' });
        if (this.currentUrl) this.loadVideo(this.currentUrl);
        else playerWrapper.createEl('div', { text: '暂无视频，请从摘要功能打开视频。' });
        window.addEventListener('message', this.boundMessageHandler);
    }

    async onClose(): Promise<void> { window.removeEventListener('message', this.boundMessageHandler); }

    private handleYouTubeMessage(event: MessageEvent): void {
        if (typeof event.data !== 'string') return;
        let parsed: unknown; try { parsed = JSON.parse(event.data); } catch { return; }
        if (isYouTubeInfoDeliveryMessage(parsed)) {
            if (this.pendingTimeResolver && parsed.info && typeof parsed.info.currentTime === 'number') {
                this.lastKnownTime = parsed.info.currentTime;
                this.pendingTimeResolver(parsed.info.currentTime);
                this.pendingTimeResolver = null;
            }
        }
    }

    loadVideo(url: string): void {
        this.currentUrl = url; this.lastKnownTime = 0;
        const container = this.containerEl.children[1];
        const playerWrapper = container.querySelector('.player-wrapper'); if (!playerWrapper) return; playerWrapper.empty();
        let embedUrl = ''; this.currentPlatform = null;
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const videoId = this.extractYouTubeId(url);
            if (videoId) { embedUrl = `${YOUTUBE_EMBED_BASE}${videoId}${YOUTUBE_EMBED_PARAMS}`; this.currentPlatform = 'youtube'; }
        } else if (url.includes('bilibili.com')) {
            const bvid = this.extractBiliBiliId(url);
            if (bvid) { embedUrl = `${BILIBILI_EMBED_BASE}?bvid=${bvid}${BILIBILI_EMBED_PARAMS}`; this.currentPlatform = 'bilibili'; }
        }
        if (embedUrl) {
            this.iframeLoadPromise = new Promise<void>(resolve => { this.iframeLoadResolve = resolve; });
            this.iframe = playerWrapper.createEl('iframe', { attr: { src: embedUrl, width: '100%', height: '100%', frameborder: '0', allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture' } });
            this.iframe.onload = () => { if (this.iframeLoadResolve) { this.iframeLoadResolve(); this.iframeLoadResolve = null; } };
            playerWrapper.addClass('player-wrapper-loaded');
        } else playerWrapper.createEl('div', { text: '无法加载视频，链接不合法。' });
    }

    async waitForLoad(): Promise<void> {
        if (!this.iframeLoadPromise) return;
        const timeout = new Promise<void>((_, reject) => setTimeout(() => reject(new Error('iframe load timeout')), 5000));
        await Promise.race([this.iframeLoadPromise, timeout]);
    }

    async getCurrentTime(): Promise<number | null> {
        if (!this.currentPlatform) return null;
        if (this.currentPlatform === 'youtube') {
            return new Promise((resolve) => {
                this.pendingTimeResolver = resolve;
                this.iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), '*');
                setTimeout(() => { if (this.pendingTimeResolver) { this.pendingTimeResolver = null; resolve(this.lastKnownTime > 0 ? this.lastKnownTime : null); } }, 2000);
            });
        }
        return this.lastKnownTime > 0 ? this.lastKnownTime : null;
    }

    async seekTo(seconds: number): Promise<void> {
        if (!this.iframe || !this.currentPlatform) { new Notice(NOTICE_MESSAGES.PLAYER_NOT_READY); return; }
        try { await this.waitForLoad(); } catch { new Notice('播放器加载超时，请稍后重试'); return; }
        this.lastKnownTime = seconds;
        const timeStr = this.formatTime(seconds);
        if (this.currentPlatform === 'youtube') {
            const command = { event: 'command', func: 'seekTo', args: [seconds, true] };
            this.iframe.contentWindow?.postMessage(JSON.stringify(command), '*');
            new Notice(NOTICE_MESSAGES.SEEK_SUCCESS_YOUTUBE(timeStr));
        } else if (this.currentPlatform === 'bilibili') {
            let currentSrc = this.iframe.src;
            currentSrc = currentSrc.replace(/[?&]t=\d+/, '').replace(/[?&]autoplay=\d/, '');
            const separator = currentSrc.includes('?') ? '&' : '?';
            const newSrc = `${currentSrc}${separator}t=${seconds}&autoplay=1`;
            this.iframeLoadPromise = new Promise<void>(resolve => { this.iframeLoadResolve = resolve; });
            this.iframe.src = newSrc;
            try { await this.waitForLoad(); } catch {}
            new Notice(NOTICE_MESSAGES.SEEK_SUCCESS_BILIBILI(timeStr));
        }
    }

    private formatTime(seconds: number): string {
        const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    private async openCurrentSummaryNote(): Promise<void> {
        if (!this.currentUrl) return;
        const notePath = await this.plugin.getOrCreateSummaryNote(this.currentUrl);
        if (notePath) await this.app.workspace.openLinkText(notePath, '');
    }

    private extractYouTubeId(url: string): string | null { return url.match(YOUTUBE_ID_REGEX)?.[2]?.length === 11 ? url.match(YOUTUBE_ID_REGEX)![2] : null; }
    private extractBiliBiliId(url: string): string | null { return url.match(BILIBILI_ID_REGEX)?.[0] ?? null; }
}