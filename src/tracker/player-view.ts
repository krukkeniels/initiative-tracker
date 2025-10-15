import { ItemView, WorkspaceLeaf } from "obsidian";
import type InitiativeTracker from "src/main";
import type { Creature } from "src/utils/creature";
import { PLAYER_VIEW_VIEW } from "../utils";

import App from "./player/PlayerView.svelte";

export default class PlayerView extends ItemView {
    _app: App;
    private isFullscreen: boolean = false;
    private hiddenElements: HTMLElement[] = [];

    getDisplayText(): string {
        return "Player View";
    }
    getViewType(): string {
        return PLAYER_VIEW_VIEW;
    }
    getIcon(): string {
        return "lucide-view";
    }
    constructor(public leaf: WorkspaceLeaf, public plugin: InitiativeTracker) {
        super(leaf);
    }
    async onOpen() {
        this._app = new App({
            target: this.contentEl,
            props: {
                plugin: this.plugin
            }
        });

        // Listen for keyboard events (F11 for fullscreen, ESC to exit fullscreen)
        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
            // Only handle events when this view's window is focused
            if (!this.isInWindow()) return;

            // F11 - Toggle fullscreen
            if (evt.key === 'F11') {
                evt.preventDefault();
                this.toggleFullscreen();
            }

            // ESC - Exit fullscreen
            if (evt.key === 'Escape' && this.isFullscreen) {
                evt.preventDefault();
                this.exitFullscreen();
            }
        });
    }

    async onClose() {
        // Restore tab bar if we were in fullscreen mode
        if (this.isFullscreen) {
            this.showTabBar();
        }
    }

    /**
     * Check if the view is in a pop-out window (vs a tab)
     */
    private isInWindow(): boolean {
        // Check if this leaf is in a floating window
        const leaf = this.leaf;
        // @ts-ignore - accessing internal property
        return leaf?.view?.containerEl?.win !== window;
    }

    /**
     * Get the Electron BrowserWindow for this view's window
     */
    private getElectronWindow(): any {
        if (!this.isInWindow()) return null;

        // Get the window object for this view (the pop-out window)
        // @ts-ignore - accessing internal property
        const win = this.containerEl.win;
        if (!win) return null;

        try {
            // Try modern @electron/remote first (Electron 14+)
            // @ts-ignore - accessing Electron remote from window context
            const remote = win.require('@electron/remote');
            if (remote) {
                return remote.getCurrentWindow();
            }
        } catch (e) {
            // Fallback to deprecated electron.remote (older Electron versions)
            try {
                // @ts-ignore - accessing Electron remote from window context
                const { remote } = win.require('electron');
                if (remote) {
                    return remote.getCurrentWindow();
                }
            } catch (e2) {
                console.error('Could not access Electron remote module:', e2);
            }
        }

        return null;
    }

    /**
     * Hide all Obsidian UI elements in the pop-out window for immersive fullscreen
     */
    private hideTabBar(): void {
        // Get the pop-out window's document
        // @ts-ignore - accessing internal property
        const win = this.containerEl.win;
        if (!win?.document) return;

        // Clear any previously hidden elements
        this.hiddenElements = [];

        // Conservative list of selectors that should only match tab chrome, not content
        const selectors = [
            '.workspace-tab-header-container',
            '.workspace-tab-header-inner',
            '.view-header',
            '.titlebar',
            '.mod-top.workspace-tab-header',
        ];

        console.log('[Player View Fullscreen] Hiding Obsidian UI elements...');

        // Find and hide all matching elements
        for (const selector of selectors) {
            const elements = win.document.querySelectorAll(selector);
            elements.forEach((el: Element) => {
                const htmlEl = el as HTMLElement;

                // SAFETY CHECK: Never hide elements that contain our content
                if (htmlEl.contains(this.containerEl)) {
                    return;
                }

                // Only hide if not already hidden
                if (htmlEl.style.display !== 'none') {
                    htmlEl.style.display = 'none';
                    this.hiddenElements.push(htmlEl);
                }
            });
        }

        console.log(`[Player View Fullscreen] Hidden ${this.hiddenElements.length} UI elements`);
    }

    /**
     * Restore all previously hidden Obsidian UI elements
     */
    private showTabBar(): void {
        console.log(`[Player View Fullscreen] Restoring ${this.hiddenElements.length} UI elements`);

        // Restore all previously hidden elements
        for (const el of this.hiddenElements) {
            el.style.display = '';
        }

        // Clear the tracking array
        this.hiddenElements = [];
    }

    /**
     * Toggle fullscreen mode
     */
    toggleFullscreen(): void {
        if (!this.isInWindow()) {
            console.warn('Fullscreen is only available for pop-out windows');
            return;
        }

        const electronWin = this.getElectronWindow();
        if (!electronWin) {
            console.warn('Could not access Electron window');
            return;
        }

        // Toggle fullscreen state
        this.isFullscreen = !this.isFullscreen;
        electronWin.setFullScreen(this.isFullscreen);

        // Hide or show Obsidian UI based on new state
        if (this.isFullscreen) {
            this.hideTabBar();
        } else {
            this.showTabBar();
        }
    }

    /**
     * Enter fullscreen mode
     */
    enterFullscreen(): void {
        if (!this.isInWindow()) return;

        const electronWin = this.getElectronWindow();
        if (!electronWin) return;

        this.isFullscreen = true;
        electronWin.setFullScreen(true);
        this.hideTabBar();
    }

    /**
     * Exit fullscreen mode
     */
    exitFullscreen(): void {
        if (!this.isInWindow()) return;

        const electronWin = this.getElectronWindow();
        if (!electronWin) return;

        this.isFullscreen = false;
        electronWin.setFullScreen(false);
        this.showTabBar();
    }
}
