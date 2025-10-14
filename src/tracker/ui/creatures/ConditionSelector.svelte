<script lang="ts">
    import { ExtraButtonComponent, Menu, setIcon } from "obsidian";
    import type InitiativeTracker from "src/main";
    import type { Condition } from "src/types/creatures";
    import { Conditions } from "src/utils/conditions";
    import { createEventDispatcher, getContext } from "svelte";
    import { getId } from "src/utils/creature";
    import { CustomConditionModal } from "src/utils/custom-condition-modal";

    const dispatch = createEventDispatcher();
    const plugin = getContext<InitiativeTracker>("plugin");

    export let compact = false; // For inline button style
    export let excludeConditions: Condition[] = []; // Already added conditions to filter out

    let customInput = "";
    let buttonEl: HTMLElement;

    const openConditionMenu = (evt: MouseEvent) => {
        evt.stopPropagation();
        const menu = new Menu();

        // Add custom condition input option first
        menu.addItem((item) => {
            item.setTitle("Add custom condition...")
                .setIcon("pencil")
                .onClick(() => {
                    // Open a modal for custom condition
                    const modal = new CustomConditionModal(plugin.app, (result) => {
                        const condition: Condition = {
                            name: result,
                            id: getId(),
                            description: ""
                        };
                        dispatch("select", condition);
                    });
                    modal.open();
                });
        });

        menu.addSeparator();

        // Get available conditions (from plugin settings, falling back to defaults)
        const availableConditions = (plugin.data?.statuses || Conditions)
            .filter((c) => !excludeConditions.find((ex) => ex.id === c.id));

        // Add each predefined condition
        availableConditions.forEach((condition) => {
            menu.addItem((item) => {
                item.setTitle(condition.name);
                if (condition.icon) {
                    item.setIcon(`condition-${condition.icon}`);
                }
                item.onClick(() => {
                    dispatch("select", { ...condition });
                });
            });
        });

        menu.showAtPosition(evt);
    };

    const addButtonIcon = (node: HTMLElement) => {
        buttonEl = node;
        const button = new ExtraButtonComponent(node)
            .setIcon("plus-circle")
            .setTooltip("Add condition");
        button.extraSettingsEl.onclick = openConditionMenu;
    };
</script>

<div class="condition-selector" class:compact>
    <div class="add-condition-button" use:addButtonIcon />
</div>

<style>
    .condition-selector {
        display: inline-flex;
        align-items: center;
    }
    .condition-selector.compact {
        margin: 0;
    }
    .add-condition-button :global(.clickable-icon) {
        margin: 0;
    }
</style>
