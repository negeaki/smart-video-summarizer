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
    defaultFolder: string;
    maxHistoryCount: number;
    history: HistoryItem[];
    autoSummarizeOnPaste: boolean;
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
    defaultFolder: 'Video Summaries',
    maxHistoryCount: 20,
    history: [],
    autoSummarizeOnPaste: false,
};

function generateId(): string {
    return Date.now() + '-' + Math.random().toString(36).substring(2, 8);
}

// ========== 设置选项卡（精简版） ==========
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
        // 1. AI 配置
        // -------------------------------------------------------------
        new Setting(containerEl).setName('AI provider').setHeading();

        // 活跃提供商选择 + 管理按钮
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

        // 摘要参数（Temperature + Max tokens）
        new Setting(containerEl)
            .setName('Temperature')
            .setDesc('Randomness (0 = deterministic, 1 = creative)')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(this.plugin.settings.temperature)
                .onChange(async (value) => {
                    this.plugin.settings.temperature = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Max tokens')
            .setDesc('Summary length limit')
            .addText(text => text
                .setValue(String(this.plugin.settings.maxTokens))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num)) {
                        this.plugin.settings.maxTokens = num;
                        await this.plugin.saveSettings();
                    }
                }));

        // -------------------------------------------------------------
        // 2. 播放器
        // -------------------------------------------------------------
        new Setting(containerEl).setName('Player').setHeading();

        new Setting(containerEl)
            .setName('Auto open')
            .setDesc('Open player when generating summary')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableMiniPlayer)
                .onChange(async (value) => {
                    this.plugin.settings.enableMiniPlayer = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Position')
            .setDesc('Left or right sidebar')
            .addDropdown(dropdown => dropdown
                .addOption('left', 'Left')
                .addOption('right', 'Right')
                .setValue(this.plugin.settings.playerPosition)
                .onChange(async (value) => {
                    this.plugin.settings.playerPosition = value as 'left' | 'right';
                    await this.plugin.saveSettings();
                    // 销毁现有播放器视图，强制下次创建新位置
                    const leaves = this.app.workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE);
                    for (const leaf of leaves) leaf.detach();
                    this.display();
                }));

        // -------------------------------------------------------------
        // 3. 字幕处理
        // -------------------------------------------------------------
        new Setting(containerEl).setName('Subtitle').setHeading();

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

        new Setting(containerEl)
            .setName('Default folder')
            .addText(text => text
                .setValue(this.plugin.settings.defaultFolder)
                .onChange(async (value) => {
                    this.plugin.settings.defaultFolder = value;
                    await this.plugin.saveSettings();
                }));

        // -------------------------------------------------------------
        // 4. 自动化
        // -------------------------------------------------------------
        new Setting(containerEl).setName('Automation').setHeading();

        new Setting(containerEl)
            .setName('Auto summarize on paste')
            .setDesc('Generate summary when pasting a video link')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSummarizeOnPaste)
                .onChange(async (value) => {
                    this.plugin.settings.autoSummarizeOnPaste = value;
                    await this.plugin.saveSettings();
                }));

        // -------------------------------------------------------------
        // 5. 历史记录
        // -------------------------------------------------------------
        new Setting(containerEl).setName('History').setHeading();

        new Setting(containerEl)
            .setName('Max entries')
            .addSlider(slider => slider
                .setLimits(1, 100, 1)
                .setValue(this.plugin.settings.maxHistoryCount)
                .onChange(async (value) => {
                    this.plugin.settings.maxHistoryCount = value;
                    if (this.plugin.settings.history.length > value) {
                        this.plugin.settings.history = this.plugin.settings.history.slice(0, value);
                    }
                    await this.plugin.saveSettings();
                    this.display();
                }));

        for (const item of this.plugin.settings.history) {
            const itemSetting = new Setting(containerEl)
                .setName(item.title)
                .setDesc(`${new Date(item.timestamp).toLocaleString()} - ${item.platform}`);

            itemSetting.addButton(btn => btn
                .setButtonText('Open')
                .onClick(async () => {
                    if (item.summaryPath) {
                        await this.app.workspace.openLinkText(item.summaryPath, '');
                    }
                    if (this.plugin.settings.enableMiniPlayer) {
                        const player = await this.plugin.activatePlayerView();
                        if (player) player.loadVideo(item.url);
                    }
                }));

            itemSetting.addButton(btn => btn
                .setIcon('trash')
                .setTooltip('Delete')
                .onClick(async () => {
                    const idx = this.plugin.settings.history.findIndex(h => h.url === item.url && h.timestamp === item.timestamp);
                    if (idx !== -1) {
                        this.plugin.settings.history.splice(idx, 1);
                        await this.plugin.saveSettings();
                        this.display();
                        new Notice('History record deleted');
                    }
                }));
        }

        new Setting(containerEl)
            .addButton(btn => btn
                .setButtonText('Clear all')
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings.history = [];
                    await this.plugin.saveSettings();
                    this.display();
                    new Notice('All history cleared');
                }));
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
        contentEl.createEl('h2', { text: 'API providers' });

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
        contentEl.createEl('h2', { text: `Edit ${this.provider.name}` });

        new Setting(contentEl)
            .setName('Name')
            .addText(text => {
                text.setValue(this.provider.name);
                text.onChange(value => this.provider.name = value);
            });

        new Setting(contentEl)
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            .setName('API Key')
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