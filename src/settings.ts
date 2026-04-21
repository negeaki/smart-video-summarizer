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
    autoSummarizeOnPaste: false,
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
        // 1. AI 提供商选择
        // -------------------------------------------------------------
        new Setting(containerEl)
            .setName('Active AI provider')
            .setDesc('Select which API provider to use for generating summaries.')
            .addDropdown(dropdown => {
                for (const p of this.plugin.settings.providers) {
                    dropdown.addOption(p.id, p.name);
                }
                dropdown.setValue(this.plugin.settings.activeProviderId);
                dropdown.onChange((value) => {
                    void (async () => {
                        this.plugin.settings.activeProviderId = value;
                        await this.plugin.saveSettings();
                        this.display();
                    })();
                });
            });

        // -------------------------------------------------------------
        // 2. API 供应商管理
        // -------------------------------------------------------------
        new Setting(containerEl).setName('API providers').setHeading();

        for (const provider of this.plugin.settings.providers) {
            const isActive = provider.id === this.plugin.settings.activeProviderId;
            const setting = new Setting(containerEl)
                .setName(provider.name)
                .setDesc(provider.isCustom ? 'Custom provider' : 'Built-in provider');

            if (isActive) {
                setting.settingEl.addClass('mod-active-provider');
                // eslint-disable-next-line obsidianmd/ui/sentence-case
                setting.setDesc('✔️ Active provider');
            }

            setting.addButton(btn => btn
                .setIcon('pencil')
                .setTooltip('Edit provider')
                .onClick(() => {
                    const providerCopy = { ...provider };
                    void new ProviderModal(this.app, providerCopy, async (updated) => {
                        const idx = this.plugin.settings.providers.findIndex(p => p.id === provider.id);
                        if (idx !== -1) {
                            this.plugin.settings.providers[idx] = updated;
                            await this.plugin.saveSettings();
                            this.display();
                        }
                    }).open();
                }));

            if (provider.isCustom) {
                setting.addButton(btn => btn
                    .setIcon('trash')
                    .setTooltip('Delete provider')
                    .onClick(() => {
                        void (async () => {
                            const idx = this.plugin.settings.providers.findIndex(p => p.id === provider.id);
                            if (idx !== -1) {
                                this.plugin.settings.providers.splice(idx, 1);
                                if (this.plugin.settings.activeProviderId === provider.id && this.plugin.settings.providers.length) {
                                    this.plugin.settings.activeProviderId = this.plugin.settings.providers[0].id;
                                }
                                await this.plugin.saveSettings();
                                this.display();
                            }
                        })();
                    }));
            }
        }

        new Setting(containerEl)
            .setName('Add new provider')
            .setDesc('Add a custom API provider')
            .addButton(btn => btn
                .setButtonText('Add provider')
                .onClick(() => {
                    void (async () => {
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
                        this.display();
                    })();
                }));

        // -------------------------------------------------------------
        // 3. 摘要参数
        // -------------------------------------------------------------
        new Setting(containerEl).setName('Summary parameters').setHeading();

        new Setting(containerEl)
            .setName('Temperature')
            .setDesc('Controls randomness (0 = deterministic, 1 = creative).')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(this.plugin.settings.temperature)
                .setDynamicTooltip()
                .onChange((value) => {
                    void (async () => {
                        this.plugin.settings.temperature = value;
                        await this.plugin.saveSettings();
                    })();
                }));

        new Setting(containerEl)
            .setName('Max tokens')
            .setDesc('Maximum length of the summary.')
            .addText(text => text
                .setValue(String(this.plugin.settings.maxTokens))
                .onChange((value) => {
                    void (async () => {
                        const num = parseInt(value);
                        if (!isNaN(num)) {
                            this.plugin.settings.maxTokens = num;
                            await this.plugin.saveSettings();
                        }
                    })();
                }));

        // -------------------------------------------------------------
        // 4. 播放器设置
        // -------------------------------------------------------------
        new Setting(containerEl).setName('Video player').setHeading();

        new Setting(containerEl)
            .setName('Enable mini player')
            .setDesc('Automatically open the video player when generating a summary.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableMiniPlayer)
                .onChange(async (value) => {
                    this.plugin.settings.enableMiniPlayer = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Player position')
            .setDesc('Where to show the video player (left or right sidebar).')
            .addDropdown(dropdown => dropdown
                .addOption('left', 'Left sidebar')
                .addOption('right', 'Right sidebar')
                .setValue(this.plugin.settings.playerPosition)
                .onChange(async (value) => {
                    this.plugin.settings.playerPosition = value as 'left' | 'right';
                    await this.plugin.saveSettings();
                    const leaves = this.app.workspace.getLeavesOfType(VIDEO_PLAYER_VIEW_TYPE);
                    for (const leaf of leaves) {
                        leaf.detach();
                    }
                    this.display();
                }));

        // -------------------------------------------------------------
        // 5. 无字幕处理
        // -------------------------------------------------------------
        new Setting(containerEl).setName('No caption handling').setHeading();

        new Setting(containerEl)
            .setName('No caption strategy')
            .setDesc('What to do when a video has no captions.')
            .addDropdown(dropdown => dropdown
                .addOption('metadata', 'Use only metadata.')
                .addOption('local', 'Import local subtitle file.')
                .addOption('skip', 'Skip this video.')
                .setValue(this.plugin.settings.noCaptionStrategy)
                .onChange((value) => {
                    void (async () => {
                        this.plugin.settings.noCaptionStrategy = value;
                        await this.plugin.saveSettings();
                    })();
                }));

        // -------------------------------------------------------------
        // 6. 历史记录
        // -------------------------------------------------------------
        new Setting(containerEl).setName('History').setHeading();

        new Setting(containerEl)
            .setName('Max history count')
            .setDesc('Maximum number of history entries to keep (1-100).')
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

        for (const item of this.plugin.settings.history) {
            const itemSetting = new Setting(containerEl)
                .setName(item.title)
                .setDesc(`${new Date(item.timestamp).toLocaleString()} - ${item.platform}`);

            itemSetting.addButton(btn => btn
                .setButtonText('Open')
                .onClick(() => {
                    void (async () => {
                        if (item.summaryPath) {
                            await this.app.workspace.openLinkText(item.summaryPath, '');
                        }
                        if (this.plugin.settings.enableMiniPlayer) {
                            const player = await this.plugin.activatePlayerView();
                            if (player) player.loadVideo(item.url);
                        } else {
                            new Notice('Video player is disabled. Enable it in settings.');
                        }
                    })();
                }));

            itemSetting.addButton(btn => btn
                .setIcon('trash')
                .setTooltip('Delete this record')
                .onClick(() => {
                    void (async () => {
                        const idx = this.plugin.settings.history.findIndex(h => h.url === item.url && h.timestamp === item.timestamp);
                        if (idx !== -1) {
                            this.plugin.settings.history.splice(idx, 1);
                            await this.plugin.saveSettings();
                            this.display();
                            new Notice('History record deleted');
                        }
                    })();
                }));
        }

        new Setting(containerEl)
            .setName('Clear all')
            .setDesc('Remove all history entries.')
            .addButton(btn => btn
                .setButtonText('Clear all')
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings.history = [];
                    await this.plugin.saveSettings();
                    this.display();
                    new Notice('All history cleared');
                }));

        // -------------------------------------------------------------
        // 7. 快捷键参考（已删除 "Open jotting" 提示）
        // -------------------------------------------------------------
        new Setting(containerEl).setName('Shortcuts reference').setHeading();

        const shortcutInfo = containerEl.createDiv({ cls: 'shortcut-info' });
        // eslint-disable-next-line obsidianmd/ui/sentence-case
        shortcutInfo.createEl('p', { text: 'To insert a timestamp in the current video summary note, go to Settings → Hotkeys and search "Insert timestamp in video note".' });
        // 已删除 "Open jotting" 相关行

        const tip = shortcutInfo.createEl('p', { text: '💡 Recommended: bind Ctrl+Shift+T.' });
        tip.addClass('shortcut-tip');
    }
}

// ========== 供应商编辑模态框（无改动） ==========
class ProviderModal extends Modal {
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
        contentEl.createEl('h2', { text: `Edit provider: ${this.provider.name}` });

        new Setting(contentEl)
            .setName('Provider name')
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
            .setDesc('API endpoint, e.g., https://api.openai.com/v1.')
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
            .setName('Test connection')
            .setDesc('Verify that the API key and endpoint are working.')
            .addButton(btn => btn
                .setButtonText('Test')
                .onClick(() => {
                    void (async () => {
                        btn.setButtonText('Testing...');
                        btn.setDisabled(true);
                        try {
                            const adapter = getApiAdapter(this.provider);
                            const success = await adapter.testConnection(this.provider);
                            if (success) {
                                new Notice('Connection successful!');
                            } else {
                                new Notice('Connection failed. Check your API key and base URL.');
                            }
                        } catch (e) {
                            const error = e instanceof Error ? e : new Error(String(e));
                            new Notice(`Error: ${error.message}`);
                        } finally {
                            btn.setButtonText('Test');
                            btn.setDisabled(false);
                        }
                    })();
                }));

        const buttonContainer = contentEl.createDiv({ cls: 'provider-modal-buttons' });
        const saveBtn = buttonContainer.createEl('button', { text: 'Save' });
        saveBtn.onclick = async () => {
            try {
                await this.onSubmit(this.provider);
                this.close();
            } catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                new Notice(`Save failed: ${error.message}`);
            }
        };
        const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelBtn.onclick = () => this.close();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}