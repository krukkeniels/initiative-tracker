<script lang="ts">
    import { ExtraButtonComponent, setIcon } from "obsidian";

    import CreatureTemplate from "./Creature.svelte";

    import { DICE, HP, META_MODIFIER } from "src/utils";
    import { Creature, getId } from "src/utils/creature";
    import { createEventDispatcher } from "svelte";

    import { tracker } from "../../stores/tracker";
    import type InitiativeTracker from "src/main";
    import { getContext } from "svelte";

    const plugin = getContext<InitiativeTracker>("plugin");
    const { state, ordered } = tracker;

    const dispatch = createEventDispatcher();

    const hpIcon = (node: HTMLElement) => {
        setIcon(node, HP);
    };

    const diceIcon = (node: HTMLElement) => {
        new ExtraButtonComponent(node).setIcon(DICE);
    };
</script>

<table class="initiative-tracker-table">
    {#if $ordered.length}
        <thead class="tracker-table-header">
            <td
                style="width: 60px;"
                use:diceIcon
                aria-label="Re-Roll Initiatives"
                on:click={(evt) => tracker.roll(plugin)}
            />
            <th class="left">Name</th>
            <th style="width: 120px;" use:hpIcon class="center" />
            <th style="width: 100px;" />
        </thead>
        <tbody>
            {#each $ordered as creature (creature.id)}
                <tr
                    class="initiative-tracker-creature"
                    class:disabled={!creature.enabled}
                    class:active={$state && creature.active}
                    class:viewing={creature.viewing}
                    class:friendly={creature.friendly}
                    data-hp={creature.hp}
                    data-hp-max={creature.current_max}
                    data-hp-percent={Math.round(
                        ((creature.hp ?? 0) / creature.max) * 100
                    )}
                    on:click={(e) => {
                        dispatch("open-combatant", creature);
                        e.stopPropagation();
                    }}
                >
                    <CreatureTemplate
                        {creature}
                        on:hp
                        on:tag
                        on:edit
                        on:open-combatant
                    />
                </tr>
            {/each}
        </tbody>
    {:else}
        <div class="no-creatures">
            <p>Add a creature to get started!</p>
            <small>Players may be created in settings.</small>
        </div>
    {/if}
</table>

<style scoped>
    .no-creatures {
        margin: 1rem;
        text-align: center;
    }
    .initiative-tracker-table {
        padding: 0.5rem;
        align-items: center;
        gap: 0.25rem 0.5rem;
        width: 100%;
        margin-left: 0rem;
        table-layout: auto;
        border-collapse: separate;
        border-spacing: 0 2px;
    }

    .left {
        text-align: left;
    }
    .center {
        text-align: center;
    }

    .tracker-table-header {
        font-weight: bolder;
        display: contents;
    }

    .initiative-tracker-creature {
        position: relative;
    }
    .initiative-tracker-creature.active {
        background-color: rgba(0, 0, 0, 0.1);
    }
    :global(.theme-dark) .initiative-tracker-creature.active {
        background-color: rgba(255, 255, 255, 0.1);
    }
    .initiative-tracker-creature.disabled :global(*) {
        color: var(--text-faint);
    }
    .initiative-tracker-creature :global(td) {
        border-top: 1px solid transparent;
        border-bottom: 1px solid transparent;
    }
    .initiative-tracker-creature :global(td:first-child) {
        border-left: 1px solid transparent;
    }
    .initiative-tracker-creature :global(td:last-child) {
        border-right: 1px solid transparent;
    }
    .initiative-tracker-creature:hover :global(td),
    .initiative-tracker-creature.viewing :global(td) {
        border-top: 1px solid var(--background-modifier-border);
        border-bottom: 1px solid var(--background-modifier-border);
        background-color: color-mix(in srgb, var(--background-modifier-border) 8%, transparent);
    }
    .initiative-tracker-creature:hover :global(td:first-child),
    .initiative-tracker-creature.viewing :global(td:first-child) {
        border-left: 1px solid var(--background-modifier-border);
    }
    .initiative-tracker-creature:hover :global(td:last-child),
    .initiative-tracker-creature.viewing :global(td:last-child) {
        border-right: 1px solid var(--background-modifier-border);
    }
</style>
