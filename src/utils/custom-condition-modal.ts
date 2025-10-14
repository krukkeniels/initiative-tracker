import { App, Modal, Setting } from "obsidian";

export class CustomConditionModal extends Modal {
    result: string | null = null;
    onSubmit: (result: string) => void;

    constructor(app: App, onSubmit: (result: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h2", { text: "Add Custom Condition" });

        let input: HTMLInputElement;

        new Setting(contentEl)
            .setName("Condition Name")
            .addText((text) => {
                input = text.inputEl;
                text.setPlaceholder("Enter condition name")
                    .onChange((value) => {
                        this.result = value;
                    });
                // Focus and select on open
                setTimeout(() => {
                    input.focus();
                    input.select();
                }, 10);
            });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Add")
                    .setCta()
                    .onClick(() => {
                        if (this.result && this.result.trim()) {
                            this.onSubmit(this.result.trim());
                        }
                        this.close();
                    })
            )
            .addButton((btn) =>
                btn.setButtonText("Cancel").onClick(() => {
                    this.close();
                })
            );

        // Handle Enter key
        contentEl.addEventListener("keydown", (evt) => {
            if (evt.key === "Enter") {
                evt.preventDefault();
                if (this.result && this.result.trim()) {
                    this.onSubmit(this.result.trim());
                }
                this.close();
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
