// src/playerView.ts
// src/playerView.ts
import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import type SmartVideoSummarizerPlugin from './main';
import {
    YOUTUBE_ID_REGEX,
    BILIBILI_ID_REGEX,
    YOUTUBE_EMBED_BASE,
    YOUTUBE_EMBED_PARAMS,
    BILIBILI_EMBED_BASE,
    BILIBILI_EMBED_PARAMS,
    NOTICE_MESSAGES,
} from './constants';

export const VIDEO_PLAYER_VIEW_TYPE = 'video-player-view';

export class VideoPlayerView extends ItemView {
    plugin: SmartVideoSummarizerPlugin;
    private iframe: HTMLIFrameElement | null = null;
    private currentUrl = '';
    private currentPlatform: 'youtube' | 'bilibili' | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: SmartVideoSummarizerPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIDEO_PLAYER_VIEW_TYPE;
    }

    getDisplayText(): string {
        return '视频播放器';
    }

    getIcon(): string {
        return 'video';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('video-player-container');

        const controls = container.createDiv({ cls: 'player-controls' });
        controls.createDiv({ cls: 'player-controls-spacer' });

        const screenshotBtn = controls.createEl('button', { text: '📸', cls: 'player-btn' });
        screenshotBtn.setAttribute('aria-label', '截图提示');
        screenshotBtn.onclick = () => {
            new Notice('请使用系统截图工具（Win+Shift+S）截取画面，然后粘贴到笔记中');
            void this.openCurrentSummaryNote().catch(e => console.error(e));
        };

        const closeBtn = controls.createEl('button', { text: '❌', cls: 'player-btn' });
        closeBtn.setAttribute('aria-label', '关闭播放器');
        closeBtn.onclick = () => this.leaf.detach();

        const playerWrapper = container.createDiv({ cls: 'player-wrapper' });
        if (this.currentUrl) {
            this.loadVideo(this.currentUrl);
        } else {
            playerWrapper.createEl('div', { text: '暂无视频，请从摘要功能打开视频。' });
        }
    }

    loadVideo(url: string): void {
        this.currentUrl = url;
        const container = this.containerEl.children[1];
        const playerWrapper = container.querySelector('.player-wrapper');
        if (!playerWrapper) return;
        playerWrapper.empty();

        let embedUrl = '';
        this.currentPlatform = null;

        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const videoId = this.extractYouTubeId(url);
            if (videoId) {
                embedUrl = `${YOUTUBE_EMBED_BASE}${videoId}${YOUTUBE_EMBED_PARAMS}`;
                this.currentPlatform = 'youtube';
            }
        } else if (url.includes('bilibili.com')) {
            const bvid = this.extractBiliBiliId(url);
            if (bvid) {
                embedUrl = `${BILIBILI_EMBED_BASE}?bvid=${bvid}${BILIBILI_EMBED_PARAMS}`;
                this.currentPlatform = 'bilibili';
            }
        }

        if (embedUrl) {
            this.iframe = playerWrapper.createEl('iframe', {
                attr: {
                    src: embedUrl,
                    width: '100%',
                    height: '100%',
                    frameborder: '0',
                    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
                }
            });
            playerWrapper.addClass('player-wrapper-loaded');
        } else {
            playerWrapper.createEl('div', { text: '无法加载视频，链接不合法。' });
        }
    }

    seekTo(seconds: number): void {
        if (!this.iframe || !this.currentPlatform) {
            new Notice(NOTICE_MESSAGES.PLAYER_NOT_READY);
            return;
        }

        const timeStr = this.formatTime(seconds);

        if (this.currentPlatform === 'youtube') {
            const command = { event: 'command', func: 'seekTo', args: [seconds, true] };
            this.iframe.contentWindow?.postMessage(JSON.stringify(command), '*');
            new Notice(NOTICE_MESSAGES.SEEK_SUCCESS_YOUTUBE(timeStr));
        } else if (this.currentPlatform === 'bilibili') {
            // B站跳转需要重新加载 iframe 并添加时间参数
            let currentSrc = this.iframe.src;
            currentSrc = currentSrc.replace(/[?&]t=\d+/, '').replace(/[?&]autoplay=\d/, '');
            const separator = currentSrc.includes('?') ? '&' : '?';
            const newSrc = `${currentSrc}${separator}t=${seconds}&autoplay=1`;
            this.iframe.src = newSrc;
            new Notice(NOTICE_MESSAGES.SEEK_SUCCESS_BILIBILI(timeStr));
        }
    }

    private formatTime(seconds: number): string {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) {
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    private async openCurrentSummaryNote(): Promise<void> {
        if (!this.currentUrl) return;
        const notePath = await this.plugin.getOrCreateSummaryNote(this.currentUrl);
        if (notePath) {
            await this.app.workspace.openLinkText(notePath, '');
        }
    }

    private extractYouTubeId(url: string): string | null {
        const match = url.match(YOUTUBE_ID_REGEX);
        return (match && match[2]?.length === 11) ? match[2] : null;
    }

    private extractBiliBiliId(url: string): string | null {
        const match = url.match(BILIBILI_ID_REGEX);
        return match ? match[0] : null;
    }

    async onClose(): Promise<void> {
        // 清理资源
    }
}