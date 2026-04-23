// modals.ts
import { App, Modal, Notice } from 'obsidian';

/**
 * 视频链接输入模态框
 */
export class UrlInputModal extends Modal {
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

        contentEl.createEl('h2', { text: '输入视频链接' });
        this.inputEl = contentEl.createEl('input', {
            type: 'text',
            placeholder: '输入 YouTube 或 B站 视频链接...',
            cls: 'video-url-input',
        });

        const btnContainer = contentEl.createDiv({ cls: 'video-modal-button-container' });
        const submitBtn = btnContainer.createEl('button', {
            text: '一键总结',
            cls: 'video-modal-button',
        });
        const cancelBtn = btnContainer.createEl('button', {
            text: '取消',
            cls: 'video-modal-button',
        });

        submitBtn.onclick = () => {
            if (this.isProcessing) return;
            const url = this.inputEl.value.trim();
            if (url) {
                this.isProcessing = true;
                submitBtn.setText('处理中...');
                this.close();
                this.onSubmit(url).catch(e => console.error(e)).finally(() => {
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

/**
 * 时间戳手动输入模态框
 */
export class TimestampInputModal extends Modal {
    private onSubmit: (seconds: number) => void;

    constructor(app: App, onSubmit: (seconds: number) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: '输入视频时间戳' });
        const inputWrapper = contentEl.createDiv({ cls: 'timestamp-input-wrapper' });
        inputWrapper.createSpan({ text: '格式 mm:ss 或 HH:mm:ss' });
        const inputEl = inputWrapper.createEl('input', {
            type: 'text',
            placeholder: '例如 1:23 或 12:34',
            cls: 'timestamp-input',
        });
        inputEl.focus();

        const btnContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        const submitBtn = btnContainer.createEl('button', { text: '插入' });
        const cancelBtn = btnContainer.createEl('button', { text: '取消' });

        submitBtn.onclick = () => {
            const val = inputEl.value.trim();
            const seconds = this.parseTimeString(val);
            if (seconds === null) {
                new Notice('无效的时间格式');
                return;
            }
            this.onSubmit(seconds);
            this.close();
        };

        cancelBtn.onclick = () => this.close();
        inputEl.addEventListener('keypress', (e: KeyboardEvent) => {
            if (e.key === 'Enter') submitBtn.click();
        });
    }

    private parseTimeString(str: string): number | null {
        const parts = str.split(':').map(p => parseInt(p, 10));
        if (parts.some(isNaN)) return null;
        if (parts.length === 2) {
            const [m, s] = parts;
            if (s >= 60) return null;
            return m * 60 + s;
        }
        if (parts.length === 3) {
            const [h, m, s] = parts;
            if (m >= 60 || s >= 60) return null;
            return h * 3600 + m * 60 + s;
        }
        return null;
    }

    onClose(): void {
        this.contentEl.empty();
    }
}