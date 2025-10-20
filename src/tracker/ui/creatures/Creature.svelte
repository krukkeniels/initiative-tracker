<script lang="ts">
    import { DEFAULT_UNDEFINED, FRIENDLY, HIDDEN, HP } from "src/utils";
    import type { Creature } from "src/utils/creature";
    import Initiative from "./Initiative.svelte";
    import CreatureControls from "./CreatureControls.svelte";
    import Status from "./Status.svelte";
    import ConditionSelector from "./ConditionSelector.svelte";
    import HPPopup from "./HPPopup.svelte";
    import { Platform, setIcon, ExtraButtonComponent } from "obsidian";
    import { tracker } from "../../stores/tracker";
    import { createEventDispatcher, getContext } from "svelte";
    import type { Condition } from "src/types/creatures";
    import type InitiativeTracker from "src/main";

    const dispatch = createEventDispatcher();
    const { updateTarget, updating, viewingCreature } = tracker;
    const plugin = getContext<InitiativeTracker>("plugin");

    export let creature: Creature;
    $: statuses = creature.status;
    $: creatureName = creature.player ? creature.name : creature.getName();

    let showHPPopup = false;
    let hpButtonElement: HTMLElement;

    const statblockLink = () => creature.getStatblockLink();
    const hiddenIcon = (div: HTMLElement) => {
        setIcon(div, HIDDEN);
    };
    const friendlyIcon = (div: HTMLElement) => {
        setIcon(div, FRIENDLY);
    };

    let hoverTimeout: NodeJS.Timeout = null;
    const tryHover = (evt: MouseEvent) => {
        hoverTimeout = setTimeout(() => {
            if (creature["statblock-link"]) {
                let link = statblockLink();
                if (/\[.+\]\(.+\)/.test(link)) {
                    //md
                    [, link] = link.match(/\[.+?\]\((.+?)\)/);
                } else if (/\[\[.+\]\]/.test(link)) {
                    //wiki
                    [, link] = link.match(/\[\[(.+?)(?:\|.+?)?\]\]/);
                }

                app.workspace.trigger(
                    "link-hover",
                    {}, //hover popover, but don't need
                    evt.target, //targetEl
                    link, //linkText
                    "initiative-tracker " //source
                );
            }
        }, 1000);
    };

    const cancelHover = (evt: MouseEvent) => {
        clearTimeout(hoverTimeout);
    };

    const hpIconFn = (node: HTMLElement) => {
        setIcon(node, HP);
    };

    const editIcon = (node: HTMLElement) => {
        const button = new ExtraButtonComponent(node)
            .setIcon("pencil")
            .setTooltip("Edit");
        button.extraSettingsEl.onclick = (evt) => {
            evt.stopPropagation();
            dispatch("edit", creature);
        };
    };

    const statblockIcon = (node: HTMLElement) => {
        const button = new ExtraButtonComponent(node)
            .setIcon("book-open")
            .setTooltip("Open Statblock");
        button.extraSettingsEl.onclick = (evt) => {
            evt.stopPropagation();
            plugin.openCombatant(creature);
        };
    };

    const handleConditionSelect = (e: CustomEvent<Condition>) => {
        const condition = e.detail;
        tracker.updateCreatures({
            creature,
            change: { status: [condition] }
        });
    };

    const handleHPClick = (evt: MouseEvent) => {
        if (showHPPopup) {
            showHPPopup = false;
            return;
        }

        showHPPopup = true;
    };

    const handleHPApply = (evt: CustomEvent<{ type: string; value: string }>) => {
        const { type, value } = evt.detail;

        if (type === "hp") {
            // Apply HP change (damage or healing)
            tracker.updateCreatures({
                creature,
                change: { hp: Number(value) }
            });
        } else if (type === "temp") {
            // Apply temp HP directly using temp field
            tracker.updateCreatures({
                creature,
                change: { temp: Number(value) }
            });
        } else if (type === "fillmax") {
            // Fill HP to maximum
            const healAmount = creature.max - creature.hp;
            if (healAmount > 0) {
                tracker.updateCreatures({
                    creature,
                    change: { hp: healAmount }
                });
            }
        }

        showHPPopup = false;
    };

    const handleHPCancel = () => {
        showHPPopup = false;
    };

    const handleOverlayClick = (evt: MouseEvent) => {
        // Close popup when clicking the overlay (not the popup itself)
        if (evt.target === evt.currentTarget) {
            showHPPopup = false;
        }
    };
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<td class="initiative-container" on:click={(e) => e.stopPropagation()}>
    <Initiative
        initiative={creature.initiative}
        modifier={[creature.modifier].flat().reduce((a, b) => a + b, 0)}
        on:click={(e) => e.stopPropagation()}
        on:initiative={(e) => {
            tracker.updateCreatures({
                creature,
                change: { initiative: Number(e.detail) }
            });
        }}
    />
</td>
<td class="name-container">
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div
        class="name-holder"
        on:click|stopPropagation={(evt) => {
            dispatch("open-combatant", creature);
        }}
        on:mouseenter={tryHover}
        on:mouseleave={cancelHover}
    >
        {#if creature.hidden}
            <div class="centered-icon" use:hiddenIcon />
        {/if}
        {#if creature.friendly}
            <div class="centered-icon" use:friendlyIcon />
        {/if}
        {#if creature.player}
            <strong class="name player">{creatureName}</strong>
        {:else}
            <span class="name">{creatureName}</span>
        {/if}
    </div>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="statuses" on:click={(e) => e.stopPropagation()}>
        {#if statuses.size}
            {#each [...statuses] as status}
                <Status
                    {status}
                    on:remove={() => {
                        tracker.updateCreatures({
                            creature,
                            change: { remove_status: [status] }
                        });
                    }}
                />
            {/each}
        {/if}
        <ConditionSelector
            compact={true}
            excludeConditions={[...statuses]}
            on:select={handleConditionSelect}
        />
    </div>
</td>

<td
    class="hp-container creature-adder"
    class:mobile={Platform.isMobile}
>
    <div
        bind:this={hpButtonElement}
        class="hp-content"
        class:selected={showHPPopup}
        on:click|stopPropagation={handleHPClick}
    >
        <div class="hp-icon" use:hpIconFn />
        <div class="hp-display">
            {@html creature.hpDisplay}
        </div>
    </div>

    {#if showHPPopup}
        <div class="hp-popup-overlay" on:click={handleOverlayClick}>
            <HPPopup
                currentHP={creature.hp}
                maxHP={creature.max}
                tempHP={creature.temp}
                on:apply={handleHPApply}
                on:cancel={handleHPCancel}
            />
        </div>
    {/if}
</td>

<td class="controls-container">
    <div class="controls-row">
        <div class="icon statblock-icon" class:selected={$viewingCreature === creature} use:statblockIcon />
        <div class="icon" use:editIcon />
        <CreatureControls
            on:click={(e) => e.stopPropagation()}
            on:tag
            on:edit
            on:hp
            {creature}
        />
    </div>
</td>

<style scoped>
    .name-holder {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: small;
        overflow: hidden;
        min-width: 0;
    }
    .centered-icon {
        display: flex;
        align-items: center;
        flex-shrink: 0;
    }
    .name {
        display: block;
        text-align: left;
        background-color: inherit;
        border: 0;
        padding: 0;
        height: unset;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .center {
        text-align: center;
    }
    .creature-adder {
        cursor: pointer;
    }
    .hp-container {
        padding: 0.25rem 0.5rem;
    }
    .hp-content {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 0.25rem;
        padding: 0.25rem 0.5rem;
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
        background-color: var(--interactive-normal);
        transition: background-color 0.1s ease;
    }
    .hp-content:hover {
        background-color: var(--interactive-hover);
    }
    .hp-content:active {
        background-color: var(--interactive-accent);
    }
    .hp-content.selected {
        background-color: var(--interactive-accent);
        border-color: var(--interactive-accent);
        color: var(--text-on-accent);
    }
    .hp-icon {
        display: flex;
        align-items: center;
        flex-shrink: 0;
    }
    .hp-display {
        flex: 1;
    }

    .statuses {
        display: flex;
        flex-flow: row wrap;
        column-gap: 0.25rem;
    }

    .initiative-container {
        border-top-left-radius: 0.25rem;
        border-bottom-left-radius: 0.25rem;
    }
    .controls-container {
        border-top-right-radius: 0.25rem;
        border-bottom-right-radius: 0.25rem;
    }
    .controls-row {
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }
    .icon :global(.clickable-icon) {
        margin-right: 0;
    }
    .statblock-icon.selected :global(.clickable-icon) {
        background-color: var(--interactive-accent);
        color: var(--text-on-accent);
        border-radius: 4px;
    }
    .mobile {
        font-size: smaller;
    }
    .hp-popup-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        background-color: rgba(0, 0, 0, 0.3);
    }
</style>
