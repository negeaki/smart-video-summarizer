// src/settings.ts
import { App, PluginSettingTab, Setting, Modal, Notice } from 'obsidian';
import type SmartVideoSummarizerPlugin from './main';
import { getApiAdapter } from './api';
import { VIDEO_PLAYER_VIEW_TYPE } from './playerView';

// ========== 类型定义 ==========
export interface ApiProvider {
    id: string;
    name: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    isCustom: boolean;
}

export interface HistoryItem {
    url: string;
    title: string;
    platform: string;
    timestamp: number;
    summaryPath?: string;
}

export interface SmartVideoSummarizerSettings {
    providers: ApiProvider[];
    activeProviderId: string;
    temperature: number;
    maxTokens: number;
    enableMiniPlayer: boolean;
    playerPosition: 'left' | 'right';
    noCaptionStrategy: string;
    maxHistoryCount: number;
    history: HistoryItem[];
}

// ========== 默认配置 ==========
const DEFAULT_PROVIDERS: ApiProvider[] = [
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
    playerPosition: 'right',
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

        // -------------------------------------------------------------
        // 分组 1: AI Provider
        // -------------------------------------------------------------
        new Setting(containerEl).setName('API provider').setHeading();

        new Setting(containerEl)
            .setName('Active provider')
            .addDropdown(dropdown => {
                for (const p of this.plugin.settings.providers) {
                    dropdown.addOption(p.id, p.name);
                }
                dropdown.setValue(this.plugin.settings.activeProviderId);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.activeProviderId = value;
                    await this.plugin.saveSettings();
                });
            })
            .addButton(btn => btn
                .setButtonText('Manage')
                .onClick(() => {
                    new ProviderManagerModal(this.app, this.plugin).open();
                }));

        new Setting(containerEl)
            .setName('Temperature')
            .setDesc('Randomness (0 = deterministic, 1 = creative)')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.01)
                .setValue(this.plugin.settings.temperature)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.temperature = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Max tokens')
            .setDesc('Maximum length of the summary')
            .addSlider(slider => slider
                .setLimits(100, 8192, 100)
                .setValue(this.plugin.settings.maxTokens)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.maxTokens = value;
                    await this.plugin.saveSettings();
                }));

        // -------------------------------------------------------------
        // 分组 2: Player
        // -------------------------------------------------------------
        new Setting(containerEl).setName('Player').setHeading();

        new Setting(containerEl)
            .setName('Auto open player')
            .setDesc('Open player when generating summary')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableMiniPlayer)
                .onChange(async (value) => {
                    this.plugin.settings.enableMiniPlayer = value;
                    await this.plugin.saveSettings();
                }));

        // Player position 改为单个开关（Right sidebar）
        new Setting(containerEl)
            .setName('Right sidebar')
            .setDesc('Enable to show player in right sidebar; disable for left sidebar')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.playerPosition === 'right')
                .onChange(async (value) => {
                    this.plugin.settings.playerPosition = value ? 'right' : 'left';
                    await this.plugin.saveSettings();
                    const leaves = this.app.workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE);
                    for (const leaf of leaves) leaf.detach();
                    this.display();
                }));

        new Setting(containerEl)
            .setName('No caption strategy')
            .addDropdown(dropdown => dropdown
                .addOption('metadata', 'Use metadata only')
                .addOption('local', 'Import local file')
                .addOption('skip', 'Skip video')
                .setValue(this.plugin.settings.noCaptionStrategy)
                .onChange(async (value) => {
                    this.plugin.settings.noCaptionStrategy = value;
                    await this.plugin.saveSettings();
                }));

        // -------------------------------------------------------------
        // 分组 3: History
        // -------------------------------------------------------------
        new Setting(containerEl).setName('History').setHeading();

        // 历史记录列表容器
        const historyContainer = containerEl.createDiv({ cls: 'history-list-container' });

        interface HistoryItemEntry {
            element: HTMLElement;
            title: string;
            platform: string;
        }
        const historyItems: HistoryItemEntry[] = [];

        const renderHistoryList = () => {
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
                    if (item.summaryPath) {
                        await this.app.workspace.openLinkText(item.summaryPath, '');
                    }
                    if (this.plugin.settings.enableMiniPlayer) {
                        const player = await this.plugin.activatePlayerView();
                        if (player) player.loadVideo(item.url);
                    }
                };
                const deleteBtn = btnGroup.createEl('button', { text: '🗑', cls: 'history-btn' });
                deleteBtn.setAttribute('aria-label', 'Delete');
                deleteBtn.onclick = async () => {
                    const idx = this.plugin.settings.history.findIndex(h => h.url === item.url && h.timestamp === item.timestamp);
                    if (idx !== -1) {
                        this.plugin.settings.history.splice(idx, 1);
                        await this.plugin.saveSettings();
                        renderHistoryList();
                    }
                };
                historyItems.push({ element: itemDiv, title: item.title, platform: item.platform });
            }
            if (history.length === 0) {
                historyContainer.createDiv({ text: 'No history records', cls: 'history-empty' });
            }
        };
        renderHistoryList();

        // Max entries 滑块
        new Setting(containerEl)
            .setName('Max entries')
            .addSlider(slider => slider
                .setLimits(1, 100, 1)
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

        // 底部操作行：Search 和 Clear all
        const actionRow = new Setting(containerEl);
        actionRow.setName('Actions');
        actionRow.addButton(btn => {
            btn.setButtonText('Search');
            btn.onClick(() => {
                new HistorySearchModal(this.app, historyItems, historyContainer).open();
            });
        });
        actionRow.addButton(btn => {
            btn.setButtonText('Clear all');
            btn.setWarning();
            btn.onClick(() => {
                const confirmModal = new ConfirmModal(this.app, 'Are you sure you want to clear all history?', (confirmed) => {
                    if (confirmed) {
                        this.plugin.settings.history = [];
                        void this.plugin.saveSettings().then(() => {
                            this.display();
                            new Notice('All history cleared');
                        });
                    }
                });
                confirmModal.open();
            });
        });
    }
}

// ========== 提供商管理模态框 ==========
class ProviderManagerModal extends Modal {
    plugin: SmartVideoSummarizerPlugin;

    constructor(app: App, plugin: SmartVideoSummarizerPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        new Setting(contentEl).setName('API providers').setHeading();

        for (const provider of this.plugin.settings.providers) {
            const setting = new Setting(contentEl)
                .setName(provider.name)
                .setDesc(provider.isCustom ? 'Custom' : 'Built-in');

            setting.addButton(btn => btn
                .setIcon('pencil')
                .setTooltip('Edit')
                .onClick(() => {
                    new ProviderEditModal(this.app, provider, async (updated) => {
                        const idx = this.plugin.settings.providers.findIndex(p => p.id === provider.id);
                        if (idx !== -1) {
                            this.plugin.settings.providers[idx] = updated;
                            await this.plugin.saveSettings();
                            this.onOpen();
                        }
                    }).open();
                }));

            if (provider.isCustom) {
                setting.addButton(btn => btn
                    .setIcon('trash')
                    .setTooltip('Delete')
                    .onClick(async () => {
                        const idx = this.plugin.settings.providers.findIndex(p => p.id === provider.id);
                        if (idx !== -1) {
                            this.plugin.settings.providers.splice(idx, 1);
                            if (this.plugin.settings.activeProviderId === provider.id && this.plugin.settings.providers.length) {
                                this.plugin.settings.activeProviderId = this.plugin.settings.providers[0].id;
                            }
                            await this.plugin.saveSettings();
                            this.onOpen();
                        }
                    }));
            }
        }

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Add provider')
                .onClick(async () => {
                    const newProvider: ApiProvider = {
                        id: generateId(),
                        name: 'New provider',
                        apiKey: '',
                        baseUrl: 'https://api.openai.com/v1',
                        model: 'gpt-3.5-turbo',
                        isCustom: true,
                    };
                    this.plugin.settings.providers.push(newProvider);
                    this.plugin.settings.activeProviderId = newProvider.id;
                    await this.plugin.saveSettings();
                    this.onOpen();
                }));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

// ========== 提供商编辑模态框 ==========
class ProviderEditModal extends Modal {
    private provider: ApiProvider;
    private onSubmit: (provider: ApiProvider) => Promise<void>;

    constructor(app: App, provider: ApiProvider, onSubmit: (provider: ApiProvider) => Promise<void>) {
        super(app);
        this.provider = { ...provider };
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        new Setting(contentEl).setName(`Edit ${this.provider.name}`).setHeading();

        new Setting(contentEl)
            .setName('Name')
            .addText(text => {
                text.setValue(this.provider.name);
                text.onChange(value => this.provider.name = value);
            });

        new Setting(contentEl)
            .setName('API key')
            .addText(text => {
                text.inputEl.type = 'password';
                text.setValue(this.provider.apiKey);
                text.onChange(value => this.provider.apiKey = value);
            });

        new Setting(contentEl)
            .setName('Base URL')
            .addText(text => {
                text.setValue(this.provider.baseUrl);
                text.onChange(value => this.provider.baseUrl = value);
            });

        new Setting(contentEl)
            .setName('Model')
            .addText(text => {
                text.setValue(this.provider.model);
                text.onChange(value => this.provider.model = value);
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Test')
                .onClick(async () => {
                    btn.setButtonText('Testing...');
                    btn.setDisabled(true);
                    try {
                        const adapter = getApiAdapter(this.provider);
                        const success = await adapter.testConnection(this.provider);
                        new Notice(success ? 'Connection successful!' : 'Connection failed. Check your API key and base URL.');
                    } catch (e) {
                        const error = e instanceof Error ? e : new Error(String(e));
                        new Notice(`Error: ${error.message}`);
                    } finally {
                        btn.setButtonText('Test');
                        btn.setDisabled(false);
                    }
                }));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Save')
                .setCta()
                .onClick(async () => {
                    await this.onSubmit(this.provider);
                    this.close();
                }))
            .addButton(btn => btn
                .setButtonText('Cancel')
                .onClick(() => this.close()));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

// ========== 历史记录搜索模态框 ==========
class HistorySearchModal extends Modal {
    private inputEl!: HTMLInputElement;
    private historyItems: Array<{ element: HTMLElement; title: string; platform: string }>;
    private container: HTMLElement;

    constructor(
        app: App,
        items: Array<{ element: HTMLElement; title: string; platform: string }>,
        container: HTMLElement
    ) {
        super(app);
        this.historyItems = items;
        this.container = container;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Search' });

        this.inputEl = contentEl.createEl('input', { type: 'text', placeholder: 'Enter title or platform...', cls: 'history-search-modal-input' });
        this.inputEl.focus();

        const buttonDiv = contentEl.createDiv({ cls: 'confirm-modal-buttons' });
        const searchBtn = buttonDiv.createEl('button', { text: 'Search' });
        const cancelBtn = buttonDiv.createEl('button', { text: 'Cancel' });

        searchBtn.onclick = () => {
            const keyword = this.inputEl.value.trim().toLowerCase();
            if (!keyword) {
                new Notice('Please enter a keyword');
                return;
            }
            const index = this.historyItems.findIndex(item =>
                item.title.toLowerCase().includes(keyword) ||
                item.platform.toLowerCase().includes(keyword)
            );
            if (index === -1) {
                new Notice('No matching history record found');
                this.close();
                return;
            }
            const targetElement = this.historyItems[index].element;
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetElement.classList.add('history-item-highlight');
            setTimeout(() => {
                targetElement.classList.remove('history-item-highlight');
            }, 2000);
            this.close();
        };

        cancelBtn.onclick = () => this.close();
        this.inputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchBtn.click();
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

// ========== 确认模态框 ==========
class ConfirmModal extends Modal {
    constructor(
        app: App,
        private message: string,
        private onConfirm: (confirmed: boolean) => void
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.createEl('p', { text: this.message });
        const buttonDiv = contentEl.createDiv({ cls: 'confirm-modal-buttons' });
        const yesBtn = buttonDiv.createEl('button', { text: 'Yes' });
        yesBtn.onclick = () => {
            this.close();
            this.onConfirm(true);
        };
        const noBtn = buttonDiv.createEl('button', { text: 'No' });
        noBtn.onclick = () => {
            this.close();
            this.onConfirm(false);
        };
    }

    onClose(): void {
        this.contentEl.empty();
    }
}