import { App, Modal, Notice, requestUrl, Setting } from "obsidian";
import type InitiativeTracker from "src/main";
import type { BackgroundMetadata } from "src/settings/settings.types";
import { BackgroundManager } from "src/utils/background-manager";
import { OpenAIImageService, IMAGE_STYLES } from "src/utils/openai-service";
import type { Creature } from "src/utils/creature";

export class BackgroundModal extends Modal {
    private backgroundManager: BackgroundManager;
    private currentTab: "browse" | "generate" = "browse";
    private selectedBackground: BackgroundMetadata | null = null;
    private backgrounds: BackgroundMetadata[] = [];
    private filteredBackgrounds: BackgroundMetadata[] = [];
    private filterType: "all" | "general" | "specific" = "all";
    private searchQuery: string = "";

    // Generate form state
    private generateName: string = "";
    private generateType: "general" | "specific" = "general";
    private generateDescription: string = "";
    private generateStyle: string;
    private generateGrimness: number;
    private isGenerating: boolean = false;
    private generatedImageUrl: string | undefined;
    private generateButton: HTMLButtonElement | null = null;

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
        this.generateStyle = plugin.data.imageStyle || "fantasy-art";
        this.generateGrimness = plugin.data.imageGrimness ?? 50;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("initiative-background-modal");

        // Title
        contentEl.createEl("h2", { text: "Background Image Manager" });

        // Tab buttons
        const tabContainer = contentEl.createDiv("background-modal-tabs");
        const browseTab = tabContainer.createEl("button", {
            text: "Browse Existing",
            cls: "background-tab-button"
        });
        const generateTab = tabContainer.createEl("button", {
            text: "Generate New",
            cls: "background-tab-button"
        });

        browseTab.addEventListener("click", () => {
            this.currentTab = "browse";
            this.refreshContent();
        });
        generateTab.addEventListener("click", () => {
            this.currentTab = "generate";
            this.refreshContent();
        });

        // Content container
        const contentContainer = contentEl.createDiv("background-modal-content");

        // Load backgrounds and render
        await this.loadBackgrounds();
        this.refreshContent();
    }

    private async loadBackgrounds() {
        this.backgrounds = await this.backgroundManager.listBackgrounds();
        this.applyFilters();
    }

    private applyFilters() {
        let filtered = this.backgrounds;

        // Filter by type
        if (this.filterType !== "all") {
            filtered = filtered.filter(bg => bg.type === this.filterType);
        }

        // Filter by search query
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(
                bg =>
                    bg.name.toLowerCase().includes(query) ||
                    bg.description?.toLowerCase().includes(query) ||
                    bg.creatures?.some(c => c.toLowerCase().includes(query))
            );
        }

        this.filteredBackgrounds = filtered;
    }

    private refreshContent() {
        const contentContainer = this.contentEl.querySelector(
            ".background-modal-content"
        ) as HTMLElement;
        if (!contentContainer) return;

        contentContainer.empty();

        // Clear button reference since we're re-rendering
        this.generateButton = null;

        // Update active tab styling
        const tabs = this.contentEl.querySelectorAll(".background-tab-button");
        tabs.forEach((tab, index) => {
            if (
                (index === 0 && this.currentTab === "browse") ||
                (index === 1 && this.currentTab === "generate")
            ) {
                tab.addClass("active");
            } else {
                tab.removeClass("active");
            }
        });

        if (this.currentTab === "browse") {
            this.renderBrowseTab(contentContainer);
        } else {
            this.renderGenerateTab(contentContainer);
        }
    }

    private renderBrowseTab(container: HTMLElement) {
        // Filters
        const filterContainer = container.createDiv("background-filters");

        // Type filter
        new Setting(filterContainer)
            .setName("Filter by type")
            .addDropdown(dropdown =>
                dropdown
                    .addOption("all", "All Types")
                    .addOption("general", "General")
                    .addOption("specific", "Specific")
                    .setValue(this.filterType)
                    .onChange(async value => {
                        this.filterType = value as "all" | "general" | "specific";
                        this.applyFilters();
                        this.refreshContent();
                    })
            );

        // Search
        new Setting(filterContainer)
            .setName("Search")
            .addSearch(search =>
                search
                    .setPlaceholder("Search backgrounds...")
                    .setValue(this.searchQuery)
                    .onChange(async value => {
                        this.searchQuery = value;
                        this.applyFilters();
                        this.refreshContent();
                    })
            );

        // Background grid
        const gridContainer = container.createDiv("background-grid");

        if (this.filteredBackgrounds.length === 0) {
            gridContainer.createEl("p", {
                text:
                    this.backgrounds.length === 0
                        ? "No backgrounds saved yet. Generate your first one!"
                        : "No backgrounds match your filters.",
                cls: "background-empty-message"
            });
        } else {
            for (const bg of this.filteredBackgrounds) {
                this.renderBackgroundCard(gridContainer, bg);
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

        const cancelBtn = actions.createEl("button", { text: "Cancel" });
        cancelBtn.addEventListener("click", () => this.close());
    }

    private renderBackgroundCard(container: HTMLElement, bg: BackgroundMetadata) {
        const card = container.createDiv("background-card");
        if (this.selectedBackground?.imagePath === bg.imagePath) {
            card.addClass("selected");
        }

        // Image
        const imgContainer = card.createDiv("background-card-image");
        const img = imgContainer.createEl("img");
        img.src = this.app.vault.adapter.getResourcePath(bg.imagePath);
        img.alt = bg.name;

        // Info
        const info = card.createDiv("background-card-info");
        info.createEl("h3", { text: bg.name });
        if (bg.description) {
            info.createEl("p", { text: bg.description, cls: "background-card-desc" });
        }
        const meta = info.createDiv("background-card-meta");
        meta.createEl("span", {
            text: bg.type === "general" ? "General" : "Specific",
            cls: `background-type-badge type-${bg.type}`
        });
        if (bg.creatures && bg.creatures.length > 0) {
            meta.createEl("span", {
                text: bg.creatures.join(", "),
                cls: "background-creatures"
            });
        }

        // Click to select
        card.addEventListener("click", () => {
            this.selectedBackground = bg;
            this.refreshContent();
        });

        // Delete button
        const deleteBtn = card.createDiv("background-card-delete");
        deleteBtn.innerHTML = "&times;";
        deleteBtn.addEventListener("click", async e => {
            e.stopPropagation();
            if (confirm(`Delete background "${bg.name}"?`)) {
                await this.backgroundManager.deleteBackground(bg);
                await this.loadBackgrounds();
                if (this.selectedBackground?.imagePath === bg.imagePath) {
                    this.selectedBackground = null;
                }
                this.refreshContent();
            }
        });
    }

    private renderGenerateTab(container: HTMLElement) {
        const form = container.createDiv("background-generate-form");

        // Name
        new Setting(form)
            .setName("Name")
            .setDesc("A descriptive name for this background")
            .addText(text =>
                text
                    .setPlaceholder("e.g., Dark Dungeon Corridor")
                    .setValue(this.generateName)
                    .onChange(value => {
                        this.generateName = value;
                        // Update button state directly without re-rendering entire form
                        if (this.generateButton) {
                            this.generateButton.disabled = !this.generateName || !this.plugin.data.openaiApiKey;
                        }
                    })
            );

        // Type
        new Setting(form)
            .setName("Type")
            .setDesc(
                "General backgrounds are reusable, Specific are for one-time encounters"
            )
            .addDropdown(dropdown =>
                dropdown
                    .addOption("general", "General (Reusable)")
                    .addOption("specific", "Specific (One-time)")
                    .setValue(this.generateType)
                    .onChange(value => (this.generateType = value as "general" | "specific"))
            );

        // Description
        new Setting(form)
            .setName("Scene Description (Optional)")
            .setDesc("Describe the scene you want to generate")
            .addTextArea(text =>
                text
                    .setPlaceholder(
                        'e.g., "A dark dungeon corridor with flickering torches"'
                    )
                    .setValue(this.generateDescription)
                    .onChange(value => (this.generateDescription = value))
            );

        // Style
        new Setting(form).setName("Art Style").addDropdown(dropdown => {
            for (const [key, label] of Object.entries(IMAGE_STYLES)) {
                dropdown.addOption(key, key.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));
            }
            dropdown
                .setValue(this.generateStyle)
                .onChange(value => (this.generateStyle = value));
        });

        // Grimness
        const grimnessLabel = form.createDiv("background-grimness-label");
        grimnessLabel.createEl("strong", { text: `Grimness Level: ${this.generateGrimness}` });
        const grimnessDesc = grimnessLabel.createEl("span", {
            cls: "setting-item-description"
        });
        this.updateGrimnessLabel(grimnessDesc);

        const slider = form.createEl("input", {
            type: "range",
            cls: "background-grimness-slider"
        });
        slider.min = "0";
        slider.max = "100";
        slider.step = "5";
        slider.value = String(this.generateGrimness);
        slider.addEventListener("input", () => {
            this.generateGrimness = parseInt(slider.value);
            grimnessLabel.querySelector("strong")!.textContent = `Grimness Level: ${this.generateGrimness}`;
            this.updateGrimnessLabel(grimnessDesc);
        });

        // Preview
        if (this.generatedImageUrl) {
            const preview = container.createDiv("background-preview");
            preview.createEl("h3", { text: "Preview" });
            const img = preview.createEl("img", { cls: "background-preview-image" });
            img.src = this.generatedImageUrl;
        }

        // Action buttons
        const actions = container.createDiv("background-modal-actions");

        if (this.isGenerating) {
            this.generateButton = null; // Clear reference when not showing button
            const generating = actions.createEl("div", {
                text: "Generating image...",
                cls: "background-generating"
            });
        } else if (this.generatedImageUrl) {
            this.generateButton = null; // Clear reference when not showing button
            // Save button
            const saveBtn = actions.createEl("button", {
                text: "Save & Use",
                cls: "mod-cta"
            });
            saveBtn.addEventListener("click", async () => {
                await this.saveGeneratedBackground();
            });

            // Use once button (don't save)
            const useOnceBtn = actions.createEl("button", {
                text: "Use Once (Don't Save)"
            });
            useOnceBtn.addEventListener("click", () => {
                // Use the URL directly without saving
                this.onSelect(this.generatedImageUrl!);
                this.close();
            });
        } else {
            // Generate button
            const generateBtn = actions.createEl("button", {
                text: "Generate Image",
                cls: "mod-cta"
            });
            generateBtn.disabled = !this.generateName || !this.plugin.data.openaiApiKey;
            this.generateButton = generateBtn; // Store reference for later updates
            if (!this.plugin.data.openaiApiKey) {
                actions.createEl("p", {
                    text: "Please configure OpenAI API key in settings first",
                    cls: "background-error"
                });
            }
            generateBtn.addEventListener("click", async () => {
                await this.generateBackground();
            });
        }

        const cancelBtn = actions.createEl("button", { text: "Cancel" });
        cancelBtn.addEventListener("click", () => this.close());
    }

    private updateGrimnessLabel(element: HTMLElement) {
        if (this.generateGrimness <= 33) {
            element.textContent = "(Bright & Hopeful)";
        } else if (this.generateGrimness <= 66) {
            element.textContent = "(Dramatic & Tense)";
        } else {
            element.textContent = "(Dark & Desperate)";
        }
    }

    private async generateBackground() {
        if (!this.plugin.data.openaiApiKey) {
            new Notice("OpenAI API key not configured");
            return;
        }

        this.isGenerating = true;
        this.refreshContent();

        try {
            const service = new OpenAIImageService(
                this.plugin.data.openaiApiKey,
                requestUrl
            );

            const visibleCreatures = this.creatures.filter(c => c.enabled && !c.hidden);

            // Only pass creatures for "specific" backgrounds
            // General backgrounds should be reusable without creature context
            const result = await service.generateImage({
                creatures: this.generateType === "specific" ? visibleCreatures : [],
                sceneDescription: this.generateDescription.trim() || undefined,
                style: this.generateStyle,
                grimness: this.generateGrimness
            });

            if (result.success && result.imageUrl) {
                this.generatedImageUrl = result.imageUrl;
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
            this.refreshContent();
        }
    }

    private async saveGeneratedBackground() {
        if (!this.generatedImageUrl || !this.generateName) {
            return;
        }

        const creatureNames = this.creatures
            .filter(c => c.enabled && !c.hidden && !c.player)
            .map(c => c.name);

        const metadata = await this.backgroundManager.downloadAndSaveImage(
            this.generatedImageUrl,
            {
                name: this.generateName,
                type: this.generateType,
                description: this.generateDescription || undefined,
                creatures: creatureNames.length > 0 ? creatureNames : undefined,
                style: this.generateStyle,
                grimness: this.generateGrimness
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
