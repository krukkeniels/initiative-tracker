import { App, Modal, Notice, requestUrl, Setting } from "obsidian";
import type InitiativeTracker from "src/main";
import type { BackgroundMetadata } from "src/settings/settings.types";
import { BackgroundManager } from "src/utils/background-manager";
import { OpenAIImageService } from "src/utils/openai-service";
import type { Creature } from "src/utils/creature";

export class BackgroundModal extends Modal {
    private backgroundManager: BackgroundManager;
    private selectedBackground: BackgroundMetadata | null = null;
    private backgrounds: BackgroundMetadata[] = [];
    private searchQuery: string = "";

    // Generate state
    private userPrompt: string = "";
    private isGenerating: boolean = false;
    private generatedImageUrl: string | undefined;
    private generatedName: string | undefined;

    constructor(
        app: App,
        private plugin: InitiativeTracker,
        private creatures: Creature[],
        private onSelect: (imagePath: string) => void
    ) {
        super(app);
        this.backgroundManager = new BackgroundManager(
            app,
            plugin.data.backgroundImagesFolder
        );
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("initiative-background-modal");

        contentEl.createEl("h2", { text: "Background Image" });

        // Generate section
        const generateSection = contentEl.createDiv("background-generate-section");
        this.renderGenerateSection(generateSection);

        // Preview section
        contentEl.createDiv("background-preview-section");

        // Saved backgrounds section
        const savedSection = contentEl.createDiv("background-saved-section");
        await this.loadBackgrounds();
        this.renderSavedSection(savedSection);
    }

    private renderGenerateSection(container: HTMLElement) {
        const row = container.createDiv("background-generate-row");

        const input = row.createEl("input", {
            type: "text",
            placeholder: "Describe the scene...",
            cls: "background-prompt-input"
        });
        input.value = this.userPrompt;
        input.addEventListener("input", () => {
            this.userPrompt = input.value;
        });
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && this.plugin.data.openaiApiKey) {
                this.generateBackground();
            }
        });

        const generateBtn = row.createEl("button", {
            text: "Generate",
            cls: "mod-cta background-generate-btn"
        });
        generateBtn.disabled = !this.plugin.data.openaiApiKey;
        generateBtn.addEventListener("click", () => this.generateBackground());

        if (!this.plugin.data.openaiApiKey) {
            container.createEl("p", {
                text: "Configure OpenAI API key in plugin settings to generate images.",
                cls: "background-warning"
            });
        }
    }

    private renderPreviewSection() {
        const container = this.contentEl.querySelector(
            ".background-preview-section"
        ) as HTMLElement;
        if (!container) return;
        container.empty();

        if (this.isGenerating) {
            const loading = container.createDiv("background-loading");
            loading.createEl("span", {
                text: "Generating image...",
                cls: "background-loading-text"
            });
        } else if (this.generatedImageUrl) {
            const preview = container.createDiv("background-preview");

            if (this.generatedName) {
                preview.createEl("h3", {
                    text: this.generatedName,
                    cls: "background-preview-name"
                });
            }

            const img = preview.createEl("img", {
                cls: "background-preview-image"
            });
            img.src = this.generatedImageUrl;

            const actions = preview.createDiv("background-preview-actions");

            const useBtn = actions.createEl("button", { text: "Use Once" });
            useBtn.addEventListener("click", () => {
                this.onSelect(this.generatedImageUrl!);
                this.close();
            });

            const saveBtn = actions.createEl("button", {
                text: "Save & Use",
                cls: "mod-cta"
            });
            saveBtn.addEventListener("click", () => this.saveGeneratedBackground());
        }
    }

    private renderSavedSection(container: HTMLElement) {
        container.empty();

        if (this.backgrounds.length === 0 && !this.generatedImageUrl && !this.isGenerating) {
            return;
        }

        if (this.backgrounds.length > 0) {
            const header = container.createDiv("background-saved-header");
            header.createEl("h3", { text: "Saved Backgrounds" });

            if (this.backgrounds.length > 6) {
                const searchInput = header.createEl("input", {
                    type: "text",
                    placeholder: "Search...",
                    cls: "background-search-input"
                });
                searchInput.value = this.searchQuery;
                searchInput.addEventListener("input", () => {
                    this.searchQuery = searchInput.value;
                    this.renderSavedSection(container);
                });
            }

            const filtered = this.getFilteredBackgrounds();
            const grid = container.createDiv("background-grid");

            if (filtered.length === 0) {
                grid.createEl("p", {
                    text: "No backgrounds match your search.",
                    cls: "background-empty-message"
                });
            } else {
                for (const bg of filtered) {
                    this.renderBackgroundCard(grid, bg, container);
                }
            }

            // Action buttons
            const actions = container.createDiv("background-modal-actions");

            const selectBtn = actions.createEl("button", {
                text: "Use Selected",
                cls: "mod-cta"
            });
            selectBtn.disabled = !this.selectedBackground;
            selectBtn.addEventListener("click", () => {
                if (this.selectedBackground) {
                    this.onSelect(this.selectedBackground.imagePath);
                    this.close();
                }
            });

            const defaultBtn = actions.createEl("button", {
                text: "Set as Default"
            });
            defaultBtn.disabled = !this.selectedBackground;
            defaultBtn.addEventListener("click", async () => {
                if (this.selectedBackground) {
                    this.plugin.data.defaultBackgroundImage =
                        this.selectedBackground.imagePath;
                    await this.plugin.saveSettings();
                    new Notice(
                        `"${this.selectedBackground.name}" set as default background`
                    );
                    this.renderSavedSection(container);
                }
            });

            const cancelBtn = actions.createEl("button", { text: "Cancel" });
            cancelBtn.addEventListener("click", () => this.close());
        }
    }

    private renderBackgroundCard(
        grid: HTMLElement,
        bg: BackgroundMetadata,
        savedContainer: HTMLElement
    ) {
        const card = grid.createDiv("background-card");
        if (this.selectedBackground?.imagePath === bg.imagePath) {
            card.addClass("selected");
        }

        const imgContainer = card.createDiv("background-card-image");
        const img = imgContainer.createEl("img");
        img.src = this.app.vault.adapter.getResourcePath(bg.imagePath);
        img.alt = bg.name;

        const info = card.createDiv("background-card-info");
        info.createEl("h3", { text: bg.name });

        const isDefault =
            this.plugin.data.defaultBackgroundImage === bg.imagePath;
        if (isDefault) {
            info.createEl("span", {
                text: "Default",
                cls: "background-default-badge"
            });
        }

        card.addEventListener("click", () => {
            this.selectedBackground = bg;
            this.renderSavedSection(savedContainer);
        });

        // Delete button
        const deleteBtn = card.createDiv("background-card-delete");
        deleteBtn.innerHTML = "&times;";
        deleteBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (confirm(`Delete background "${bg.name}"?`)) {
                await this.backgroundManager.deleteBackground(bg);
                if (this.selectedBackground?.imagePath === bg.imagePath) {
                    this.selectedBackground = null;
                }
                await this.loadBackgrounds();
                this.renderSavedSection(savedContainer);
            }
        });
    }

    private getFilteredBackgrounds(): BackgroundMetadata[] {
        if (!this.searchQuery) return this.backgrounds;

        const query = this.searchQuery.toLowerCase();
        return this.backgrounds.filter(
            (bg) =>
                bg.name.toLowerCase().includes(query) ||
                bg.userPrompt?.toLowerCase().includes(query) ||
                bg.creatures?.some((c) => c.toLowerCase().includes(query))
        );
    }

    private async loadBackgrounds() {
        this.backgrounds = await this.backgroundManager.listBackgrounds();
    }

    private async generateBackground() {
        if (!this.plugin.data.openaiApiKey) {
            new Notice("OpenAI API key not configured");
            return;
        }

        this.isGenerating = true;
        this.generatedImageUrl = undefined;
        this.generatedName = undefined;
        this.renderPreviewSection();

        try {
            const service = new OpenAIImageService(
                this.plugin.data.openaiApiKey,
                requestUrl
            );

            const result = await service.generateImage({
                creatures: this.creatures,
                userPrompt: this.userPrompt.trim() || undefined,
                style: this.plugin.data.imageStyle || "fantasy-art",
                grimness: this.plugin.data.imageGrimness ?? 50
            });

            if (result.success && result.imageUrl) {
                this.generatedImageUrl = result.imageUrl;
                this.generatedName = result.generatedName;
                new Notice("Image generated successfully!");
            } else {
                new Notice(`Failed to generate image: ${result.error}`);
            }
        } catch (error) {
            console.error("[BackgroundModal] Generation error:", error);
            new Notice(
                `Error: ${error instanceof Error ? error.message : "Unknown error"}`
            );
        } finally {
            this.isGenerating = false;
            this.renderPreviewSection();
        }
    }

    private async saveGeneratedBackground() {
        if (!this.generatedImageUrl || !this.generatedName) {
            return;
        }

        const creatureNames = this.creatures
            .filter((c) => c.enabled && !c.hidden && !c.player)
            .map((c) => c.name);

        const metadata = await this.backgroundManager.downloadAndSaveImage(
            this.generatedImageUrl,
            {
                name: this.generatedName,
                userPrompt: this.userPrompt.trim() || undefined,
                creatures:
                    creatureNames.length > 0 ? creatureNames : undefined,
                style: this.plugin.data.imageStyle || "fantasy-art",
                grimness: this.plugin.data.imageGrimness ?? 50
            }
        );

        if (metadata) {
            this.onSelect(metadata.imagePath);
            this.close();
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
