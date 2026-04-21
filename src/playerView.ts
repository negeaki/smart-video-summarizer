import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import type SmartVideoSummarizerPlugin from './main';

export const VIDEO_PLAYER_VIEW_TYPE = 'video-player-view';

/**
 * 视频播放器视图
 * 功能：嵌入 YouTube/B站 视频，提供截图提示和关闭功能
 * 时间戳和随手记通过快捷键在笔记中完成，不在播放器中重复
 */
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

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('video-player-container');

        // 控制栏：截图 + 关闭，右对齐
        const controls = container.createDiv({ cls: 'player-controls' });
        // 占位元素将按钮推到右侧（不使用变量，避免 ESLint 未使用警告）
        controls.createDiv({ cls: 'player-controls-spacer' });

        // 截图按钮：引导用户使用系统截图工具
        const screenshotBtn = controls.createEl('button', { text: '📸', cls: 'player-btn' });
        screenshotBtn.setAttribute('aria-label', '截图提示');
        screenshotBtn.onclick = () => {
            new Notice('请使用系统截图工具（Win+Shift+S）截取画面，然后粘贴到笔记中');
            // 异步调用需使用 void 并捕获错误
            void this.openCurrentSummaryNote().catch(e => console.error(e));
        };

        // 关闭按钮：销毁播放器视图
        const closeBtn = controls.createEl('button', { text: '❌', cls: 'player-btn' });
        closeBtn.setAttribute('aria-label', '关闭播放器');
        closeBtn.onclick = () => this.leaf.detach();

        // 播放器容器
        const playerWrapper = container.createDiv({ cls: 'player-wrapper' });
        if (this.currentUrl) {
            this.loadVideo(this.currentUrl);
        } else {
            playerWrapper.createEl('div', { text: '暂无视频，请从摘要功能打开视频。' });
        }
    }

    /**
     * 加载视频
     * @param url - YouTube 或 B站 视频链接
     */
    loadVideo(url: string): void {
        this.currentUrl = url;
        const container = this.containerEl.children[1];
        const playerWrapper = container.querySelector('.player-wrapper');
        if (!playerWrapper) return;
        playerWrapper.empty();

        let embedUrl = '';
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const videoId = this.extractYouTubeId(url);
            if (videoId) {
                embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0`;
            }
        } else if (url.includes('bilibili.com')) {
            const bvid = this.extractBiliBiliId(url);
            if (bvid) {
                embedUrl = `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&high_quality=1&autoplay=0`;
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

    /**
     * 打开当前视频对应的总结笔记
     */
    private async openCurrentSummaryNote(): Promise<void> {
        if (!this.currentUrl) return;
        const notePath = await this.plugin.getOrCreateSummaryNote(this.currentUrl);
        if (notePath) {
            await this.app.workspace.openLinkText(notePath, '');
        }
    }

    /**
     * 从 URL 中提取 YouTube 视频 ID
     */
    private extractYouTubeId(url: string): string | null {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    /**
     * 从 URL 中提取 B站 视频 BV 号
     */
    private extractBiliBiliId(url: string): string | null {
        const match = url.match(/BV[0-9A-Za-z]{10}/);
        return match ? match[0] : null;
    }

    async onClose(): Promise<void> {
        // 清理资源（iframe 会自动销毁）
    }
}