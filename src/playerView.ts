import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import type SmartVideoSummarizerPlugin from './main';

export const VIDEO_PLAYER_VIEW_TYPE = 'video-player-view';

export class VideoPlayerView extends ItemView {
    plugin: SmartVideoSummarizerPlugin;
    private iframe: HTMLIFrameElement | null = null;
    private currentUrl = '';

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

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('video-player-container');

        const controls = container.createDiv({ cls: 'player-controls' });
        controls.createDiv({ cls: 'player-controls-spacer' });

        const timestampBtn = controls.createEl('button', { text: '⏱️', cls: 'player-btn' });
        timestampBtn.setAttribute('aria-label', '插入时间戳');
        timestampBtn.onclick = () => this.insertTimestamp();

        const noteBtn = controls.createEl('button', { text: '📝', cls: 'player-btn' });
        noteBtn.setAttribute('aria-label', '随手记');
        noteBtn.onclick = () => this.openOrCreateNote();

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

    loadVideo(url: string) {
        this.currentUrl = url;
        const container = this.containerEl.children[1];
        const playerWrapper = container.querySelector('.player-wrapper');
        if (!playerWrapper) return;
        playerWrapper.empty();

        let embedUrl = '';
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const videoId = this.extractYouTubeId(url);
            if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0`;
        } else if (url.includes('bilibili.com')) {
            const bvid = this.extractBiliBiliId(url);
            if (bvid) embedUrl = `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&high_quality=1&autoplay=0`;
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

    private extractYouTubeId(url: string): string | null {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    private extractBiliBiliId(url: string): string | null {
        const match = url.match(/BV[0-9A-Za-z]{10}/);
        return match ? match[0] : null;
    }

    private async insertTimestamp() {
        if (!this.currentUrl) {
            new Notice('没有加载视频，无法插入时间戳');
            return;
        }
        const timestamp = `[⏱️ ${new Date().toLocaleTimeString()}]`;
        const notePath = await this.plugin.ensureNoteForUrl(this.currentUrl, true);
        if (!notePath) {
            new Notice('无法创建笔记，请检查文件夹权限');
            return;
        }
        await this.plugin.ensureTimestampSectionAndInsert(notePath, timestamp);
        new Notice('时间戳已插入');
    }

    private async openOrCreateNote() {
        if (!this.currentUrl) {
            new Notice('没有加载视频，无法创建笔记');
            return;
        }
        const notePath = await this.plugin.ensureNoteForUrl(this.currentUrl, true);
        if (!notePath) {
            new Notice('无法创建笔记');
            return;
        }
        await this.plugin.ensureJottingSectionAndFocus(notePath);
        new Notice('已打开随手记笔记');
    }

    async onClose() {
        // 清理资源
    }
}