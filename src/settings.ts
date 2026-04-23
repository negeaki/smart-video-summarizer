import { App, PluginSettingTab, Setting, Modal, Notice } from 'obsidian';
import type SmartVideoSummarizerPlugin from './main';
import { getApiAdapter, ExtendedApiProvider } from './api';
import { VIDEO_PLAYER_VIEW_TYPE } from './playerView';
import { NOTICE_MESSAGES } from './constants';

// 类型定义
export interface HistoryItem {
    url: string;
    title: string;
    platform: string;
    timestamp: number;
    summaryPath?: string;
}
export interface SmartVideoSummarizerSettings {
    providers: ExtendedApiProvider[];
    activeProviderId: string;
    temperature: number;
    maxTokens: number;
    enableMiniPlayer: boolean;
    playerPosition: 'sidebar-left' | 'sidebar-right' | 'center';
    noCaptionStrategy: string;          // 'metadata' | 'local' | 'skip'
    maxHistoryCount: number;
    history: HistoryItem[];
}

const DEFAULT_PROVIDERS: ExtendedApiProvider[] = [
    {
        id: 'gemini-default',
        name: 'Gemini',
        apiKey: '',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        model: 'gemini-1.5-pro',
        isCustom: false,
    },
    {
        id: 'deepseek-default',
        name: 'DeepSeek',
        apiKey: '',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        isCustom: false,
    },
];

export const DEFAULT_SETTINGS: SmartVideoSummarizerSettings = {
    providers: DEFAULT_PROVIDERS,
    activeProviderId: 'gemini-default',
    temperature: 0.7,
    maxTokens: 2048,
    enableMiniPlayer: true,
    playerPosition: 'sidebar-right',
    noCaptionStrategy: 'metadata',
    maxHistoryCount: 20,
    history: [],
};

function generateId(): string {
    return Date.now() + '-' + Math.random().toString(36).substring(2, 8);
}

// ========== 设置选项卡 ==========
export class SmartVideoSummarizerSettingTab extends PluginSettingTab {
    plugin: SmartVideoSummarizerPlugin;

    constructor(app: App, plugin: SmartVideoSummarizerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // ---------- 隐私警告 ----------
        new Setting(containerEl)
            .setDesc('⚠️ API 密钥以明文保存在 data.json 中，请勿分享该文件。若使用同步，建议将 data.json 加入忽略列表。')
            .setClass('api-key-warning');

        // ---------- API Provider 分组 ----------
        new Setting(containerEl).setName('API provider').setHeading();

        new Setting(containerEl)
            .setName('Active provider')
            .addDropdown(dropdown => {
                for (const p of this.plugin.settings.providers) {
                    dropdown.addOption(p.id, p.name);
                }
                dropdown.setValue(this.plugin.settings.activeProviderId)
                    .onChange(async (value) => {
                        this.plugin.settings.activeProviderId = value;
                        await this.plugin.saveSettings();
                    });
            })
            .addButton(btn => {
                btn.setButtonText('Manage')
                   .setCta()   // Obsidian 主色按钮（紫色）
                   .onClick(() => new ProviderManagerModal(this.app, this.plugin).open());
            });

        new Setting(containerEl)
            .setName('Temperature')
            .setDesc('随机性 (0 = 确定性，1 = 创造性)')
            .addSlider(slider => slider.setLimits(0, 1, 0.01)
                .setValue(this.plugin.settings.temperature)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.temperature = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Max tokens')
            .setDesc('摘要的最大长度（token）')
            .addSlider(slider => slider.setLimits(100, 8192, 100)
                .setValue(this.plugin.settings.maxTokens)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.maxTokens = value;
                    await this.plugin.saveSettings();
                }));

        // ---------- Player 分组 ----------
        new Setting(containerEl).setName('Player').setHeading();

        new Setting(containerEl)
            .setName('Auto open player')
            .setDesc('生成摘要后自动打开播放器')
            .addToggle(toggle => toggle.setValue(this.plugin.settings.enableMiniPlayer)
                .onChange(async (value) => {
                    this.plugin.settings.enableMiniPlayer = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Player position')
            .setDesc('视频播放器的位置')
            .addDropdown(dropdown => {
                dropdown.addOption('sidebar-left', 'Left sidebar');
                dropdown.addOption('sidebar-right', 'Right sidebar');
                dropdown.addOption('center', 'Center tab');
                dropdown.setValue(this.plugin.settings.playerPosition)
                    .onChange(async (value) => {
                        this.plugin.settings.playerPosition = value as 'sidebar-left' | 'sidebar-right' | 'center';
                        await this.plugin.saveSettings();
                        // 移动播放器后重建视图
                        const leaves = this.app.workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE);
                        leaves.forEach(leaf => leaf.detach());
                        this.display();
                    });
            });

        // ---------- 无字幕策略 ----------
        new Setting(containerEl)
            .setName('No caption strategy')
            .setDesc('当视频无官方字幕时的处理方式。选择 "本地导入" 后，生成摘要时会自动弹出文件选择器。')
            .addDropdown(dropdown => dropdown
                .addOption('metadata', 'Use metadata only')
                .addOption('local', 'Import local file')
                .addOption('skip', 'Skip video')
                .setValue(this.plugin.settings.noCaptionStrategy)
                .onChange(async (value) => {
                    this.plugin.settings.noCaptionStrategy = value;
                    await this.plugin.saveSettings();
                }));

        // ---------- 历史记录分组 ----------
        new Setting(containerEl).setName('History').setHeading();

        const historyContainer = containerEl.createDiv({ cls: 'history-list-container' });
        interface HistoryItemEntry {
            element: HTMLElement;
            title: string;
            platform: string;
        }
        const historyItems: HistoryItemEntry[] = [];

        const renderHistoryList = (): void => {
            historyContainer.empty();
            historyItems.length = 0;
            const history = this.plugin.settings.history;

            for (const item of history) {
                const itemDiv = historyContainer.createDiv({ cls: 'history-item' });
                const infoSpan = itemDiv.createSpan({ cls: 'history-info' });
                infoSpan.setText(`${item.title}  (${new Date(item.timestamp).toLocaleString()} - ${item.platform})`);

                const btnGroup = itemDiv.createSpan({ cls: 'history-buttons' });

                const openBtn = btnGroup.createEl('button', { text: 'Open', cls: 'history-btn' });
                openBtn.onclick = async () => {
                    if (item.summaryPath) await this.app.workspace.openLinkText(item.summaryPath, '');
                    if (this.plugin.settings.enableMiniPlayer) {
                        const player = await this.plugin.activatePlayerView();
                        if (player) player.loadVideo(item.url);
                    }
                };

                const deleteBtn = btnGroup.createEl('button', { text: '🗑', cls: 'history-btn' });
                deleteBtn.setAttribute('aria-label', 'Delete');
                deleteBtn.onclick = async () => {
                    const idx = this.plugin.settings.history.findIndex(
                        h => h.url === item.url && h.timestamp === item.timestamp
                    );
                    if (idx !== -1) {
                        this.plugin.settings.history.splice(idx, 1);
                        await this.plugin.saveSettings();
                        renderHistoryList();
                        new Notice(NOTICE_MESSAGES.HISTORY_DELETED);
                    }
                };

                historyItems.push({ element: itemDiv, title: item.title, platform: item.platform });
            }

            if (history.length === 0) {
                historyContainer.createDiv({ text: 'No history records', cls: 'history-empty' });
            }
        };

        renderHistoryList();

        new Setting(containerEl)
            .setName('Max entries')
            .addSlider(slider => slider.setLimits(1, 100, 1)
                .setValue(this.plugin.settings.maxHistoryCount)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.maxHistoryCount = value;
                    if (this.plugin.settings.history.length > value) {
                        this.plugin.settings.history = this.plugin.settings.history.slice(0, value);
                    }
                    await this.plugin.saveSettings();
                    this.display();
                }));

        const actionRow = new Setting(containerEl);
        actionRow.setName('Actions');
        actionRow.addButton(btn => {
            btn.setButtonText('Search')
               .onClick(() => new HistorySearchModal(this.app, historyItems, historyContainer).open());
        });
        actionRow.addButton(btn => {
            btn.setButtonText('Clear all')
               .setWarning()
               .onClick(() => {
                   new ConfirmModal(this.app, 'Are you sure you want to clear all history?', (confirmed: boolean) => {
                       if (confirmed) {
                           this.plugin.settings.history = [];
                           this.plugin.saveSettings().then(() => {
                               this.display();
                               new Notice(NOTICE_MESSAGES.HISTORY_CLEARED);
                           });
                       }
                   }).open();
               });
        });
    }
}

// ========== Provider 管理模态框 ==========
class ProviderManagerModal extends Modal {
    plugin: SmartVideoSummarizerPlugin;
    constructor(app: App, plugin: SmartVideoSummarizerPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Manage API Providers' });

        const list = contentEl.createDiv({ cls: 'provider-list' });
        this.renderProviderList(list);

        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText('Add custom provider')
                   .setCta()
                   .onClick(() => {
                       new ProviderEditModal(this.app, (provider) => {
                           this.plugin.settings.providers.push(provider);
                           this.plugin.saveSettings().then(() => {
                               this.renderProviderList(list);
                               if (this.plugin.settings.activeProviderId === '' && this.plugin.settings.providers.length > 0) {
                                   this.plugin.settings.activeProviderId = this.plugin.settings.providers[0].id;
                               }
                           });
                       }).open();
                   });
            });
    }

    private renderProviderList(container: HTMLElement): void {
        container.empty();
        for (const provider of this.plugin.settings.providers) {
            const item = container.createDiv({ cls: 'provider-item' });
            item.createSpan({ text: `${provider.name} (${provider.isCustom ? '自定义' : '内置'})` });
            if (!provider.isCustom) {
                item.createEl('button', { text: '✏️' }).onclick = () => {
                    new ProviderEditModal(this.app, (updated) => {
                        const idx = this.plugin.settings.providers.findIndex(p => p.id === provider.id);
                        if (idx !== -1) {
                            this.plugin.settings.providers[idx] = updated;
                            this.plugin.saveSettings().then(() => this.renderProviderList(container));
                        }
                    }, provider).open();
                };
            }
            item.createEl('button', { text: '🗑' }).onclick = async () => {
                this.plugin.settings.providers = this.plugin.settings.providers.filter(p => p.id !== provider.id);
                if (this.plugin.settings.activeProviderId === provider.id && this.plugin.settings.providers.length > 0) {
                    this.plugin.settings.activeProviderId = this.plugin.settings.providers[0].id;
                }
                await this.plugin.saveSettings();
                this.renderProviderList(container);
            };
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

// ========== Provider 编辑模态框 ==========
class ProviderEditModal extends Modal {
    private onSubmit: (provider: ExtendedApiProvider) => void;
    private provider?: ExtendedApiProvider;
    private nameInput!: HTMLInputElement;
    private apiKeyInput!: HTMLInputElement;
    private baseUrlInput!: HTMLInputElement;
    private modelInput!: HTMLInputElement;

    constructor(app: App, onSubmit: (provider: ExtendedApiProvider) => void, provider?: ExtendedApiProvider) {
        super(app);
        this.onSubmit = onSubmit;
        this.provider = provider;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.provider ? 'Edit Provider' : 'Add Provider' });

        new Setting(contentEl).setName('Name').addText(text => {
            this.nameInput = text.inputEl;
            if (this.provider) text.setValue(this.provider.name);
        });

        new Setting(contentEl).setName('API Key').addText(text => {
            this.apiKeyInput = text.inputEl;
            if (this.provider) text.setValue(this.provider.apiKey);
        });

        new Setting(contentEl).setName('Base URL').addText(text => {
            this.baseUrlInput = text.inputEl;
            if (this.provider) text.setValue(this.provider.baseUrl);
        });

        new Setting(contentEl).setName('Model').addText(text => {
            this.modelInput = text.inputEl;
            if (this.provider) text.setValue(this.provider.model);
        });

        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText('Save')
                   .setCta()
                   .onClick(() => {
                       const newProvider: ExtendedApiProvider = {
                           id: this.provider ? this.provider.id : generateId(),
                           name: this.nameInput.value,
                           apiKey: this.apiKeyInput.value,
                           baseUrl: this.baseUrlInput.value,
                           model: this.modelInput.value,
                           isCustom: true,
                       };
                       this.onSubmit(newProvider);
                       this.close();
                   });
            })
            .addButton(btn => {
                btn.setButtonText('Cancel').onClick(() => this.close());
            });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

// ========== 历史搜索模态框 ==========
class HistorySearchModal extends Modal {
    private historyItems: { element: HTMLElement; title: string; platform: string }[];
    private historyContainer: HTMLElement;

    constructor(app: App, historyItems: { element: HTMLElement; title: string; platform: string }[], historyContainer: HTMLElement) {
        super(app);
        this.historyItems = historyItems;
        this.historyContainer = historyContainer;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Search History' });

        const input = contentEl.createEl('input', { type: 'text', placeholder: '输入关键字...' });
        input.addEventListener('input', () => {
            const keyword = input.value.toLowerCase();
            this.historyItems.forEach(item => {
                const visible = item.title.toLowerCase().includes(keyword) || item.platform.toLowerCase().includes(keyword);
                item.element.style.display = visible ? '' : 'none';
            });
        });

        new Setting(contentEl)
            .addButton(btn => btn.setButtonText('Clear Search').onClick(() => {
                input.value = '';
                this.historyItems.forEach(item => item.element.style.display = '');
            }))
            .addButton(btn => btn.setButtonText('Close').onClick(() => this.close()));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

// ========== 确认弹窗 ==========
class ConfirmModal extends Modal {
    private message: string;
    private onConfirm: (confirmed: boolean) => void;

    constructor(app: App, message: string, onConfirm: (confirmed: boolean) => void) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('p', { text: this.message });
        new Setting(contentEl)
            .addButton(btn => btn.setButtonText('Confirm').setWarning().onClick(() => { this.onConfirm(true); this.close(); }))
            .addButton(btn => btn.setButtonText('Cancel').onClick(() => { this.onConfirm(false); this.close(); }));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}