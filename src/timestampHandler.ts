// timestampHandler.ts
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import type { PluginValue } from '@codemirror/view';
import { MarkdownRenderChild } from 'obsidian';
import type SmartVideoSummarizerPlugin from './main';

/**
 * 编辑模式时间戳点击处理器（CodeMirror 扩展）
 */
export class TimestampEditClickHandler implements PluginValue {
    private view: EditorView;
    private plugin: SmartVideoSummarizerPlugin;

    constructor(view: EditorView, plugin: SmartVideoSummarizerPlugin) {
        this.view = view;
        this.plugin = plugin;
        this.view.dom.addEventListener('click', this.onClick);
    }

    update(_update: ViewUpdate): void {
        // 无需更新
    }

    destroy(): void {
        this.view.dom.removeEventListener('click', this.onClick);
    }

    private onClick = async (e: MouseEvent): Promise<void> => {
        const target = e.target as HTMLElement;
        const anchor = target.closest('a');
        if (!anchor) return;

        const href = anchor.getAttribute('href');
        if (!href) return;

        try {
            const url = new URL(href, window.location.origin);
            const t = url.searchParams.get('t');
            if (!t) return;
            const seconds = parseInt(t, 10);
            if (isNaN(seconds)) return;

            e.preventDefault();
            e.stopPropagation();

            url.searchParams.delete('t');
            const videoUrl = url.toString();
            await this.plugin.handleTimestampClick(videoUrl, seconds);
        } catch {
            // 忽略无效 URL
        }
    };
}

/**
 * 创建一个编辑模式时间戳点击扩展
 */
export const timestampEditExtension = (plugin: SmartVideoSummarizerPlugin) =>
    ViewPlugin.define((view: EditorView) => new TimestampEditClickHandler(view, plugin));

/**
 * 阅读模式时间戳点击处理器（Markdown 渲染子项）
 */
export class TimestampLinkHandler extends MarkdownRenderChild {
    private plugin: SmartVideoSummarizerPlugin;

    constructor(containerEl: HTMLElement, plugin: SmartVideoSummarizerPlugin) {
        super(containerEl);
        this.plugin = plugin;
    }

    onload(): void {
        this.registerDomEvent(this.containerEl, 'click', this.handleTimestampClick.bind(this));
    }

    private async handleTimestampClick(event: MouseEvent): Promise<void> {
        const target = event.target as HTMLElement;
        const anchor = target.closest('a');
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        if (!href) return;

        const parsedUrl = new URL(href, window.location.origin);
        const timeParam = parsedUrl.searchParams.get('t');
        if (!timeParam) return;
        const seconds = parseInt(timeParam, 10);
        if (isNaN(seconds)) return;

        event.preventDefault();
        event.stopPropagation();

        const urlObj = new URL(href);
        urlObj.searchParams.delete('t');
        const videoUrl = urlObj.toString();
        await this.plugin.handleTimestampClick(videoUrl, seconds);
    }
}