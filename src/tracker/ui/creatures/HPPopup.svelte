<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { setIcon } from "obsidian";

    export let currentHP: number;
    export let maxHP: number;
    export let tempHP: number = 0;

    const dispatch = createEventDispatcher();

    let value: string = "";
    let inputElement: HTMLInputElement;

    onMount(() => {
        if (inputElement) {
            inputElement.focus();
        }
    });

    const damageIcon = (node: HTMLElement) => {
        setIcon(node, "zap");
    };

    const healIcon = (node: HTMLElement) => {
        setIcon(node, "heart");
    };

    const tempIcon = (node: HTMLElement) => {
        setIcon(node, "shield");
    };

    const maxIcon = (node: HTMLElement) => {
        setIcon(node, "trending-up");
    };

    function handleKeydown(evt: KeyboardEvent) {
        const key = evt.key;

        // Enter to apply damage (default action)
        if (key === "Enter") {
            handleDamage();
            evt.preventDefault();
            return;
        }

        // Escape to cancel
        if (key === "Escape") {
            dispatch("cancel");
            evt.preventDefault();
            return;
        }

        // Only allow numbers
        if (!/^[0-9]$/.test(key) && !["Backspace", "Delete", "ArrowLeft", "ArrowRight"].includes(key)) {
            evt.preventDefault();
            return;
        }
    }

    function handleDamage() {
        if (!value) return;

        // Negative value = damage
        dispatch("apply", { type: "hp", value: "-" + value });
    }

    function handleHeal() {
        if (!value) return;

        // Positive value = healing
        dispatch("apply", { type: "hp", value: value });
    }

    function handleTemp() {
        if (!value) return;

        dispatch("apply", { type: "temp", value: value });
    }

    function handleMax() {
        // Fill to max HP (no input value needed)
        dispatch("apply", { type: "fillmax", value: "" });
    }
</script>

<div class="hp-popup" on:click|stopPropagation>
    <div class="hp-popup-header">
        <div class="hp-display">
            <span class="current-hp">{currentHP}</span>
            <span class="separator">/</span>
            <span class="max-hp">{maxHP}</span>
            {#if tempHP > 0}
                <span class="temp-hp">+{tempHP}</span>
            {/if}
        </div>
    </div>

    <div class="hp-popup-content">
        <div class="input-row">
            <input
                type="text"
                bind:this={inputElement}
                bind:value
                on:keydown={handleKeydown}
                placeholder="0"
                class="hp-input"
            />
        </div>

        <div class="action-buttons">
            <button
                class="action-button damage"
                on:click={handleDamage}
            >
                <div class="icon" use:damageIcon />
                <span>Damage</span>
            </button>
            <button
                class="action-button heal"
                on:click={handleHeal}
            >
                <div class="icon" use:healIcon />
                <span>Heal</span>
            </button>
        </div>

        <div class="quick-actions">
            <button class="quick-button" on:click={handleTemp}>
                <div class="icon" use:tempIcon />
                <span>Temp</span>
            </button>
            <button class="quick-button" on:click={handleMax}>
                <div class="icon" use:maxIcon />
                <span>Max</span>
            </button>
        </div>

        <div class="help-text">
            <small>
                <kbd>Enter</kbd> for damage · <kbd>Esc</kbd> to cancel
            </small>
        </div>
    </div>
</div>

<style>
    .hp-popup {
        position: absolute;
        z-index: 1000;
        background-color: var(--background-primary);
        border: 1px solid var(--background-modifier-border);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        padding: 0.75rem;
        min-width: 220px;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .hp-popup-header {
        text-align: center;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--background-modifier-border);
    }

    .hp-display {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.25rem;
        font-size: 1.2em;
        font-weight: 600;
    }

    .current-hp {
        color: var(--text-normal);
    }

    .separator {
        color: var(--text-muted);
    }

    .max-hp {
        color: var(--text-muted);
    }

    .temp-hp {
        color: var(--text-accent);
        font-size: 0.9em;
        margin-left: 0.25rem;
    }

    .hp-popup-content {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .action-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
    }

    .action-button {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.25rem;
        padding: 0.6rem;
        border: 2px solid var(--background-modifier-border);
        border-radius: 4px;
        background-color: var(--interactive-normal);
        cursor: pointer;
        transition: all 0.15s ease;
        font-size: 0.95em;
        font-weight: 500;
    }

    .action-button:hover {
        background-color: var(--interactive-hover);
        transform: translateY(-1px);
    }

    .action-button:active {
        transform: translateY(0);
    }

    .action-button.damage {
        border-color: rgba(255, 100, 100, 0.3);
    }

    .action-button.damage:hover {
        border-color: rgba(255, 100, 100, 0.6);
        background-color: rgba(255, 100, 100, 0.1);
    }

    .action-button.heal {
        border-color: rgba(100, 255, 100, 0.3);
    }

    .action-button.heal:hover {
        border-color: rgba(100, 255, 100, 0.6);
        background-color: rgba(100, 255, 100, 0.1);
    }

    .action-button .icon {
        display: flex;
        align-items: center;
    }

    .input-row {
        display: flex;
        align-items: center;
    }

    .hp-input {
        width: 100%;
        padding: 0.5rem;
        font-size: 1.2em;
        text-align: center;
        border: 2px solid var(--background-modifier-border);
        border-radius: 4px;
        background-color: var(--background-secondary);
    }

    .hp-input:focus {
        border-color: var(--interactive-accent);
        outline: none;
    }

    .quick-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
    }

    .quick-button {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.25rem;
        padding: 0.4rem;
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
        background-color: var(--background-secondary);
        cursor: pointer;
        transition: all 0.15s ease;
        font-size: 0.85em;
    }

    .quick-button:hover {
        background-color: var(--interactive-hover);
    }

    .quick-button .icon {
        display: flex;
        align-items: center;
    }

    .help-text {
        text-align: center;
        color: var(--text-muted);
        margin-top: 0.25rem;
    }

    .help-text kbd {
        padding: 0.1rem 0.3rem;
        border: 1px solid var(--background-modifier-border);
        border-radius: 3px;
        background-color: var(--background-secondary);
        font-size: 0.85em;
        font-family: var(--font-monospace);
    }
</style>
