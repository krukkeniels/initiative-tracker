import type { App, RequestUrlParam, RequestUrlResponse, TFolder } from "obsidian";
import { Notice, normalizePath, requestUrl } from "obsidian";
import type { BackgroundMetadata } from "src/settings/settings.types";

/**
 * Manages background images for the Initiative Tracker
 * Handles downloading, saving, listing, and deleting background images
 */
export class BackgroundManager {
    constructor(
        private app: App,
        private backgroundsFolder: string
    ) {}

    /**
     * Download an image from a URL and save it to the vault
     */
    async downloadAndSaveImage(
        imageUrl: string,
        metadata: Omit<BackgroundMetadata, "imagePath" | "createdAt">
    ): Promise<BackgroundMetadata | null> {
        try {
            // Ensure the backgrounds folder exists
            await this.ensureFolderExists();

            // Download the image
            const response = await requestUrl({
                url: imageUrl,
                method: "GET"
            });

            if (response.status !== 200) {
                new Notice(`Failed to download image: HTTP ${response.status}`);
                return null;
            }

            // Generate filename
            const timestamp = Date.now();
            const sanitizedName = this.sanitizeFilename(metadata.name);
            const filename = `${timestamp}-${sanitizedName}.png`;
            const imagePath = normalizePath(`${this.backgroundsFolder}/${filename}`);

            // Save image to vault
            await this.app.vault.createBinary(imagePath, response.arrayBuffer);

            // Create full metadata
            const fullMetadata: BackgroundMetadata = {
                ...metadata,
                imagePath,
                createdAt: timestamp
            };

            // Save metadata
            await this.saveMetadata(fullMetadata);

            new Notice(`Background "${metadata.name}" saved successfully!`);
            return fullMetadata;
        } catch (error) {
            console.error("[BackgroundManager] Error downloading/saving image:", error);
            new Notice(`Failed to save background: ${error instanceof Error ? error.message : "Unknown error"}`);
            return null;
        }
    }

    /**
     * Save metadata for a background image
     */
    private async saveMetadata(metadata: BackgroundMetadata): Promise<void> {
        const metadataPath = this.getMetadataPath(metadata.imagePath);
        await this.app.vault.create(metadataPath, JSON.stringify(metadata, null, 2));
    }

    /**
     * Get metadata path for an image path
     */
    private getMetadataPath(imagePath: string): string {
        return imagePath.replace(/\.png$/, ".json");
    }

    /**
     * List all background images with their metadata
     */
    async listBackgrounds(): Promise<BackgroundMetadata[]> {
        try {
            const abstractFile = this.app.vault.getAbstractFileByPath(this.backgroundsFolder);
            if (!abstractFile || !("children" in abstractFile)) {
                return [];
            }

            const folder = abstractFile as TFolder;
            const backgrounds: BackgroundMetadata[] = [];

            // Read all JSON metadata files
            for (const file of folder.children) {
                if (file.path.endsWith(".json")) {
                    try {
                        const content = await this.app.vault.adapter.read(file.path);
                        const metadata: BackgroundMetadata = JSON.parse(content);
                        backgrounds.push(metadata);
                    } catch (error) {
                        console.error(`[BackgroundManager] Error reading metadata ${file.path}:`, error);
                    }
                }
            }

            // Sort by creation date (newest first)
            backgrounds.sort((a, b) => b.createdAt - a.createdAt);

            return backgrounds;
        } catch (error) {
            console.error("[BackgroundManager] Error listing backgrounds:", error);
            return [];
        }
    }

    /**
     * Get backgrounds filtered by type
     */
    async getBackgroundsByType(type: "general" | "specific"): Promise<BackgroundMetadata[]> {
        const all = await this.listBackgrounds();
        return all.filter(bg => bg.type === type);
    }

    /**
     * Search backgrounds by name or description
     */
    async searchBackgrounds(query: string): Promise<BackgroundMetadata[]> {
        const all = await this.listBackgrounds();
        const lowerQuery = query.toLowerCase();
        return all.filter(
            bg =>
                bg.name.toLowerCase().includes(lowerQuery) ||
                bg.description?.toLowerCase().includes(lowerQuery) ||
                bg.creatures?.some(c => c.toLowerCase().includes(lowerQuery))
        );
    }

    /**
     * Delete a background image and its metadata
     */
    async deleteBackground(metadata: BackgroundMetadata): Promise<boolean> {
        try {
            // Delete image file
            const imageFile = this.app.vault.getAbstractFileByPath(metadata.imagePath);
            if (imageFile) {
                await this.app.vault.delete(imageFile);
            }

            // Delete metadata file
            const metadataPath = this.getMetadataPath(metadata.imagePath);
            const metadataFile = this.app.vault.getAbstractFileByPath(metadataPath);
            if (metadataFile) {
                await this.app.vault.delete(metadataFile);
            }

            new Notice(`Background "${metadata.name}" deleted`);
            return true;
        } catch (error) {
            console.error("[BackgroundManager] Error deleting background:", error);
            new Notice(`Failed to delete background: ${error instanceof Error ? error.message : "Unknown error"}`);
            return false;
        }
    }

    /**
     * Ensure the backgrounds folder exists
     */
    private async ensureFolderExists(): Promise<void> {
        const exists = await this.app.vault.adapter.exists(this.backgroundsFolder);
        if (!exists) {
            await this.app.vault.createFolder(this.backgroundsFolder);
        }
    }

    /**
     * Sanitize a filename to remove invalid characters
     */
    private sanitizeFilename(name: string): string {
        return name
            .replace(/[^a-z0-9-_]/gi, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .toLowerCase()
            .substring(0, 50); // Limit length
    }

    /**
     * Update the backgrounds folder path
     */
    updateFolder(newFolder: string): void {
        this.backgroundsFolder = newFolder;
    }

    /**
     * Get the current backgrounds folder path
     */
    getFolder(): string {
        return this.backgroundsFolder;
    }
}
