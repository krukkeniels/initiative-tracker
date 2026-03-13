<script lang="ts">
    import type { Creature } from "src/utils/creature";
    import { tracker } from "../../stores/tracker";
    import { ExtraButtonComponent } from "obsidian";

    export let creature: Creature;

    $: hpPerMinion = creature.hpPerMinion;
    $: hordeSize = creature.hordeSize;
    $: remainingMinions = creature.remainingMinions;
    $: currentHP = creature.hp;
    $: maxHP = creature.current_max;
    $: percentAlive = hordeSize > 0 ? (remainingMinions / hordeSize) * 100 : 0;

    // Color coding based on % remaining
    $: statusColor =
        percentAlive === 100
            ? "#10b981" // Green
            : percentAlive >= 50
            ? "#f59e0b" // Amber
            : percentAlive > 0
            ? "#dc2626" // Red
            : "#6b7280"; // Gray

    const handleRemoveMinion = (evt: MouseEvent) => {
        evt.stopPropagation();
        if (remainingMinions > 0) {
            tracker.updateCreatures({
                creature,
                change: { remove_minion: 1 }
            });
        }
    };

    const removeIcon = (node: HTMLElement) => {
        const button = new ExtraButtonComponent(node)
            .setIcon("minus-circle")
            .setTooltip("Remove 1 minion");
        button.extraSettingsEl.onclick = handleRemoveMinion;
    };
</script>

<div class="horde-info">
    <div class="horde-counter" style="color: {statusColor}">
        {#each Array(Math.min(hordeSize, 12)) as _, i}
            <span class="circle">{i < remainingMinions ? "●" : "○"}</span>
        {/each}
        {#if hordeSize > 12}
            <span class="counter-text">...</span>
        {/if}
        <span class="counter-text">({remainingMinions}/{hordeSize})</span>
    </div>

    <div class="horde-hp">
        <span class="hp-pool">{currentHP}/{maxHP}</span>
        {#if hpPerMinion > 0}
            <span class="hp-per-minion">({hpPerMinion} each)</span>
        {/if}
    </div>

    {#if remainingMinions > 0}
        <div class="remove-minion-btn" use:removeIcon />
    {/if}
</div>

<style>
    .horde-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: small;
    }

    .horde-counter {
        display: flex;
        align-items: center;
        gap: 0.1rem;
        flex-wrap: wrap;
        line-height: 1;
    }

    .circle {
        font-size: 1em;
        line-height: 1;
    }

    .counter-text {
        margin-left: 0.2rem;
        font-size: 0.9em;
        font-weight: 500;
    }

    .horde-hp {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        flex-wrap: wrap;
    }

    .hp-pool {
        font-weight: 600;
    }

    .hp-per-minion {
        font-size: 0.85em;
        color: var(--text-muted);
    }

    .remove-minion-btn :global(.clickable-icon) {
        padding: 0.15rem;
        cursor: pointer;
    }

    .remove-minion-btn :global(.clickable-icon):hover {
        color: var(--text-error);
    }
</style>
