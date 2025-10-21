<script lang="ts">
    import { setIcon, Notice, Modal } from "obsidian";
    import { fade } from "svelte/transition";
    import { onMount, onDestroy } from "svelte";

    import { AC, FRIENDLY, HP, INITIATIVE } from "src/utils";
    import type { Creature } from "src/utils/creature";
    import { createEventDispatcher } from "svelte";
    import type InitiativeTracker from "src/main";
    import { getConditionIconSvg } from "src/utils/condition-icons";
    import { getHpIconSvg } from "src/utils/hp-icons";

    import { tracker } from "../stores/tracker";
    const { state, ordered, data, backgroundImageUrl, round, turnStartTime } = tracker;

    export let plugin: InitiativeTracker;

    const hpIcon = (node: HTMLElement) => {
        setIcon(node, HP);
    };
    const acIcon = (node: HTMLElement) => {
        setIcon(node, AC);
    };
    const iniIcon = (node: HTMLElement) => {
        setIcon(node, INITIATIVE);
    };

    const getHpStatus = (hp: number, max: number) => {
        if (!hp) return "";
        if (hp <= 0) return "Defeated";
        if (hp < max / 2) return "Bloodied";
        if (hp < max) return "Hurt";
        return "Healthy";
    };

    const getHpIcon = (creature: Creature): string => {
        const { hp, max, status } = creature;
        if (!hp) return "skull";

        // Check for unconscious or incapacitated status
        const hasDeathStatus = [...status].some(
            (s) => s.name === "Unconscious" || s.name === "Incapacitated"
        );

        if (hp <= 0 || hasDeathStatus) return "skull"; // Defeated
        if (hp < max / 2) return "empty"; // Bloodied
        if (hp < max) return "half"; // Hurt
        return "full"; // Healthy
    };

    const getHeartStates = (creature: Creature): string[] => {
        const { hp, max, status } = creature;
        if (!hp) return ["empty", "empty", "empty"];

        // Check for unconscious or incapacitated status
        const hasDeathStatus = [...status].some(
            (s) => s.name === "Unconscious" || s.name === "Incapacitated"
        );

        if (hp <= 0 || hasDeathStatus) {
            // Defeated - 3 empty hearts
            return ["empty", "empty", "empty"];
        } else if (hp < max / 2) {
            // Bloodied (< 50% HP) - 1 full, 2 empty
            return ["full", "empty", "empty"];
        } else if (hp < max) {
            // Hurt (< 100% HP but >= 50%) - 2 full, 1 empty
            return ["full", "full", "empty"];
        } else {
            // Healthy (100% HP) - 3 full hearts
            return ["full", "full", "full"];
        }
    };

    const heartIcon = (node: HTMLElement) => {
        setIcon(node, "heart");
    };

    const skullIcon = (node: HTMLElement) => {
        setIcon(node, "skull");
    };

    const amIActive = (creature: Creature) => {
        if (creature.hidden) return false;
        if (creature.active) return true;

        const active = $ordered.findIndex((c) => c.active);
        const index = $ordered.indexOf(creature);
        if (active == -1 || active < index) return false;

        const remaining = $ordered.slice(index + 1, active + 1);
        if (remaining.every((c) => c.hidden)) return true;
        return false;
    };

    $: activeAndVisible = $ordered.filter((c) => c.enabled && !c.hidden);

    const name = (creature: Creature) => creature.getName();

    onDestroy(() => {
        if (timerInterval) {
            clearInterval(timerInterval);
        }
    });

    // Turn timer
    let elapsedSeconds = 0;
    let timerInterval: ReturnType<typeof setInterval> | null = null;

    // Format elapsed time as MM:SS
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Format encounter time based on rounds
    const formatEncounterTime = (totalSeconds: number): string => {
        if (totalSeconds < 60) {
            return `${totalSeconds}s`;
        }
        const hours = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    };

    // Calculate total encounter time in seconds
    $: encounterTimeSeconds = $round * ($data.secondsPerRound ?? 6);

    // Update elapsed time every second
    onMount(() => {
        timerInterval = setInterval(() => {
            if ($turnStartTime && $state) {
                elapsedSeconds = Math.floor((Date.now() - $turnStartTime) / 1000);
            } else {
                elapsedSeconds = 0;
            }
        }, 100); // Update every 100ms for smooth display
    });

    // Get active creature for the card display
    $: activeCreature = (() => {
        if (activeAndVisible.length === 0 || !$state) return null;
        return activeAndVisible.find(c => amIActive(c));
    })();
    const friendIcon = (node: HTMLElement) => {
        setIcon(node, FRIENDLY);
    };

    const getCreatureType = (creature: Creature): "monster" | "ally" | "player" => {
        if (creature.player) return "player";
        if (creature.friendly) return "ally";
        return "monster";
    };

    const skullTypeIcon = (node: HTMLElement) => {
        setIcon(node, "skull");
    };
    const userIcon = (node: HTMLElement) => {
        setIcon(node, "user");
    };
    const swordIcon = (node: HTMLElement) => {
        setIcon(node, "swords");
    };

    // Helper to detect if a string starts with an emoji
    const isEmoji = (str: string | undefined): boolean => {
        if (!str || str.length === 0) return false;

        // Emoji regex pattern - matches most common emojis
        const emojiRegex = /^[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\u{1F3FB}-\u{1F3FF}]/u;
        return emojiRegex.test(str);
    };

    // Helper to get the first emoji from a string
    const getFirstEmoji = (str: string | undefined): string => {
        if (!str) return "";

        // Match the first emoji (including skin tone modifiers and ZWJ sequences)
        const emojiMatch = str.match(/[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}][\p{Emoji_Modifier}]*/u);
        return emojiMatch ? emojiMatch[0] : str.charAt(0);
    };

    // Helper to convert vault paths to resource URLs
    const getImageUrl = (path: string | undefined): string | undefined => {
        if (!path) return undefined;

        // If it's already a URL (http, https, data), return as-is
        if (/^(https?:|data:)/i.test(path)) {
            return path;
        }

        // Convert vault-relative path to resource URL
        try {
            // Try to get the file from the vault
            const file = plugin.app.vault.getAbstractFileByPath(path);

            if (file && file.path) {
                // File exists, use getResourcePath
                const resourcePath = plugin.app.vault.adapter.getResourcePath(file.path);
                console.log(`[PlayerView] Converted image path (via TFile):`, {
                    originalPath: path,
                    filePath: file.path,
                    resourcePath
                });
                return resourcePath;
            } else {
                // File not found directly, try with getResourcePath anyway
                // (in case it's a valid path that just isn't indexed yet)
                const resourcePath = plugin.app.vault.adapter.getResourcePath(path);
                console.log(`[PlayerView] Converted image path (direct):`, {
                    originalPath: path,
                    resourcePath,
                    fileNotFound: true
                });
                return resourcePath;
            }
        } catch (e) {
            console.error(`[PlayerView] Failed to convert image path:`, path, e);
            return undefined;
        }
    };

</script>

<div class="player-view-container" transition:fade>
    <!-- Background Image -->
    {#if $backgroundImageUrl}
        <div class="background-image" style="background-image: url({getImageUrl($backgroundImageUrl)})" transition:fade></div>
        <div class="background-overlay"></div>
    {/if}

    <!-- LEFT PANE: Active and Upcoming Cards -->
    <div class="cards-container">
        <!-- Round Header -->
        {#if $state}
            <div class="round-header">
                <div class="round-number">ROUND {$round}</div>
                <div class="encounter-time">{formatEncounterTime(encounterTimeSeconds)} elapsed</div>
            </div>
        {/if}

        <!-- Active Creature Card -->
        {#if activeCreature}
            {@const creature = activeCreature}
            {@const imageUrl = getImageUrl(creature.image || creature.image_url)}
            <div
                class="detail-card active-card creature-type-{getCreatureType(creature)}"
                data-creature-id={creature.id}
            >
                <!-- Turn Timer (Top-left corner, only when threshold exceeded) -->
                {#if $state && $turnStartTime && (($data.turnTimerThreshold ?? 120) === 0 || elapsedSeconds >= ($data.turnTimerThreshold ?? 120))}
                    <div class="turn-timer" class:warning={elapsedSeconds >= ($data.turnTimerThreshold ?? 120) && ($data.turnTimerThreshold ?? 120) > 0}>
                        <div class="timer-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                        </div>
                        <div class="timer-text">{formatTime(elapsedSeconds)}</div>
                    </div>
                {/if}

                <!-- Health Badge (Top-right corner) -->
                <div class="health-badge {getHpStatus(creature.hp, creature.max).toLowerCase()}">
                    {#if creature.player && $data.diplayPlayerHPValues}
                        <div class="hp-text">{@html creature.hpDisplay}</div>
                    {:else}
                        {@const heartStates = getHeartStates(creature)}
                        <div class="health-icons multi-hearts">
                            {#each heartStates as heartState}
                                <span class="heart-icon">{@html getHpIconSvg(heartState)}</span>
                            {/each}
                        </div>
                    {/if}
                </div>

                <!-- Image Container -->
                <div class="image-container">
                    {#if imageUrl}
                        <img
                            src={imageUrl}
                            alt={name(creature)}
                            class="creature-image"
                            on:error={(e) => console.error(`[PlayerView] Image failed to load for ${creature.getName()}:`, imageUrl, e)}
                        />
                    {:else}
                        <div class="no-image-placeholder creature-type-{getCreatureType(creature)}">
                            {#if creature.player}
                                <span use:userIcon />
                            {:else if creature.friendly}
                                <span use:friendIcon />
                            {:else}
                                <span use:swordIcon />
                            {/if}
                        </div>
                    {/if}

                    <!-- Conditions Section (above name, only if statuses exist) -->
                    {#if creature.status.size > 0}
                        <div class="conditions-container">
                            {#each [...creature.status] as condition (condition.id)}
                                <span class="condition-chip">
                                    {#if condition.icon}
                                        {#if isEmoji(condition.icon)}
                                            <span class="condition-chip-emoji">
                                                {getFirstEmoji(condition.icon)}
                                            </span>
                                        {:else}
                                            <span class="condition-chip-icon">
                                                {@html getConditionIconSvg(condition.icon)}
                                            </span>
                                        {/if}
                                    {/if}
                                    <span class="condition-chip-name">{condition.name}</span>
                                </span>
                            {/each}
                        </div>
                    {/if}

                    <!-- Name Banner (overlays bottom of image) -->
                    <div class="name-banner creature-type-{getCreatureType(creature)}">
                        <div class="creature-name">{name(creature)}</div>
                    </div>
                </div>
            </div>
        {/if}
    </div>

    <!-- RIGHT PANE: Initiative Sidebar -->
    <div class="initiative-sidebar">
        {#each activeAndVisible as creature (creature.id)}
            {@const imageUrl = getImageUrl(creature.image || creature.image_url)}
            <div
                class="initiative-item creature-type-{getCreatureType(creature)}"
                class:active={amIActive(creature) && $state}
            >
                <!-- Avatar with Initiative Badge -->
                <div class="avatar-container">
                    {#if imageUrl}
                        <img
                            src={imageUrl}
                            alt={name(creature)}
                            class="avatar-image creature-type-{getCreatureType(creature)}"
                            on:error={(e) => console.error(`[PlayerView] Avatar failed to load for ${creature.getName()}:`, imageUrl, e)}
                        />
                    {:else}
                        <div class="avatar-placeholder creature-type-{getCreatureType(creature)}">
                            {#if creature.player}
                                <span use:userIcon />
                            {:else if creature.friendly}
                                <span use:friendIcon />
                            {:else}
                                <span use:swordIcon />
                            {/if}
                        </div>
                    {/if}
                    <span class="init-badge" class:active-badge={amIActive(creature) && $state}>{creature.initiative}</span>
                </div>

                <span class="init-name">{name(creature)}</span>

                <!-- Condition Icons -->
                {#if creature.status.size > 0}
                    <div class="sidebar-conditions">
                        {#each [...creature.status].slice(0, 5) as status}
                            {#if status.icon}
                                {#if isEmoji(status.icon)}
                                    <span class="sidebar-condition-emoji" title={status.name}>
                                        {getFirstEmoji(status.icon)}
                                    </span>
                                {:else}
                                    <span class="sidebar-condition-icon" title={status.name}>
                                        {@html getConditionIconSvg(status.icon)}
                                    </span>
                                {/if}
                            {/if}
                        {/each}
                        {#if creature.status.size > 5}
                            <span class="sidebar-condition-more">+{creature.status.size - 5}</span>
                        {/if}
                    </div>
                {:else}
                    <div class="sidebar-conditions"></div>
                {/if}

                <!-- Health Icons (Rightmost column with divider) -->
                {#if creature.player && $data.diplayPlayerHPValues}
                    <div class="sidebar-health">
                        <span class="sidebar-hp-text">{@html creature.hpDisplay}</span>
                    </div>
                {:else}
                    {@const heartStates = getHeartStates(creature)}
                    <div class="sidebar-health multi-hearts-sidebar">
                        {#each heartStates as heartState}
                            <span class="sidebar-heart-icon">{@html getHpIconSvg(heartState)}</span>
                        {/each}
                    </div>
                {/if}
            </div>
        {/each}
    </div>
</div>

<style scoped>
    /* === CONTAINER === */
    .player-view-container {
        position: relative;
        height: 100%;
        width: 100%;
        padding: 16px;
        box-sizing: border-box;
        display: flex;
        gap: 20px;
    }

    /* === CARDS CONTAINER === */
    .cards-container {
        flex: 0 0 40%;
        display: flex;
        flex-direction: column;
        gap: 16px;
        position: relative;
        z-index: 10;
        overflow: visible;
    }

    /* === ROUND HEADER === */
    .round-header {
        text-align: center;
        padding: 12px 16px;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(8px);
        border-radius: 8px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        color: rgba(255, 255, 255, 0.95);
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        z-index: 10;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .round-number {
        font-size: 1.2em;
        font-weight: 700;
        letter-spacing: 0.05em;
    }

    .encounter-time {
        font-size: 0.85em;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.75);
        letter-spacing: 0.03em;
    }

    :global(.theme-dark) .round-header {
        background: rgba(0, 0, 0, 0.75);
    }

    /* === DETAIL CARD === */
    .detail-card {
        width: 100%;
        display: flex;
        flex-direction: column;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        transition: all 0.3s ease;
        position: relative;
        overflow: visible; /* Allow health badge to overflow */
    }

    /* Active Card - Larger */
    .detail-card.active-card {
        flex: 1 1 auto;
        min-height: 400px;
    }

    /* === CREATURE TYPE BORDERS & BACKGROUNDS === */
    .detail-card.creature-type-monster {
        border: 4px solid #dc2626;
        background-color: rgba(220, 38, 38, 0.08);
    }

    .detail-card.creature-type-ally {
        border: 4px solid #10b981;
        background-color: rgba(16, 185, 129, 0.08);
    }

    .detail-card.creature-type-player {
        border: 4px solid #3b82f6;
        background-color: rgba(59, 130, 246, 0.12);
    }

    :global(.theme-dark) .detail-card.creature-type-monster {
        background-color: rgba(220, 38, 38, 0.12);
    }

    :global(.theme-dark) .detail-card.creature-type-ally {
        background-color: rgba(16, 185, 129, 0.12);
    }

    :global(.theme-dark) .detail-card.creature-type-player {
        background-color: rgba(59, 130, 246, 0.15);
    }

    /* === ACTIVE CARD STYLING === */
    .detail-card.active-card {
        box-shadow:
            0 0 0 3px rgba(251, 191, 36, 0.4),
            0 0 35px rgba(251, 191, 36, 0.6),
            0 8px 20px rgba(0, 0, 0, 0.3);
        animation: activeGlow 2s ease-in-out infinite;
    }

    @keyframes activeGlow {
        0%, 100% {
            box-shadow:
                0 0 0 3px rgba(251, 191, 36, 0.4),
                0 0 35px rgba(251, 191, 36, 0.6),
                0 8px 20px rgba(0, 0, 0, 0.3);
        }
        50% {
            box-shadow:
                0 0 0 5px rgba(251, 191, 36, 0.6),
                0 0 50px rgba(251, 191, 36, 0.8),
                0 12px 30px rgba(0, 0, 0, 0.4);
        }
    }

    /* === TURN TIMER (Top-left corner) === */
    .turn-timer {
        position: absolute;
        top: 8px;
        left: 8px;
        z-index: 20;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        border-radius: 8px;
        background: rgba(251, 191, 36, 0.95);
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        border: 2px solid rgba(251, 191, 36, 0.6);
        animation: timerPulse 2s ease-in-out infinite;
        transition: all 0.3s ease;
    }

    .turn-timer.warning {
        background: rgba(220, 38, 38, 0.95);
        border: 2px solid rgba(220, 38, 38, 0.7);
        animation: timerWarningPulse 1s ease-in-out infinite;
    }

    @keyframes timerPulse {
        0%, 100% {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        }
        50% {
            box-shadow: 0 4px 16px rgba(251, 191, 36, 0.6);
        }
    }

    @keyframes timerWarningPulse {
        0%, 100% {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            transform: scale(1);
        }
        50% {
            box-shadow: 0 4px 20px rgba(220, 38, 38, 0.8);
            transform: scale(1.05);
        }
    }

    .timer-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(0, 0, 0, 0.9);
    }

    .timer-icon svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
    }

    .timer-text {
        font-size: 1.1em;
        font-weight: 700;
        color: rgba(0, 0, 0, 0.9);
        text-shadow: 0 1px 2px rgba(255, 255, 255, 0.5);
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.05em;
    }

    /* === HEALTH BADGE (Top-right corner) === */
    .health-badge {
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 20;
        padding: 8px 12px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        border: 2px solid rgba(255, 255, 255, 0.3);
    }

    :global(.theme-dark) .health-badge {
        background: rgba(0, 0, 0, 0.85);
    }

    /* Health Badge Colors */
    .health-badge.healthy {
        border-color: #10b981;
        background: rgba(16, 185, 129, 0.85);
    }

    .health-badge.hurt {
        border-color: #f59e0b;
        background: rgba(245, 158, 11, 0.85);
    }

    .health-badge.bloodied {
        border-color: #dc2626;
        background: rgba(220, 38, 38, 0.85);
    }

    .health-badge.defeated {
        border-color: #6b7280;
        background: rgba(107, 114, 128, 0.85);
    }

    .hp-text {
        font-size: 0.9em;
        font-weight: 700;
        color: white;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
        white-space: nowrap;
    }

    /* === IMAGE CONTAINER === */
    .image-container {
        position: relative;
        flex: 1;
        width: 100%;
        overflow: hidden;
        border-radius: 8px 8px 0 0;
    }

    .creature-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }

    /* === NO IMAGE PLACEHOLDER === */
    .no-image-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
    }

    .no-image-placeholder.creature-type-monster {
        background: linear-gradient(135deg, rgba(220, 38, 38, 1.0) 0%, rgba(153, 27, 27, 1.0) 100%);
    }

    .no-image-placeholder.creature-type-ally {
        background: linear-gradient(135deg, rgba(16, 185, 129, 1.0) 0%, rgba(5, 150, 105, 1.0) 100%);
    }

    .no-image-placeholder.creature-type-player {
        background: linear-gradient(135deg, rgba(59, 130, 246, 1.0) 0%, rgba(37, 99, 235, 1.0) 100%);
    }

    .no-image-placeholder :global(svg) {
        width: 100px;
        height: 100px;
        opacity: 0.4;
        filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
    }

    /* === NAME BANNER === */
    .name-banner {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 16px 12px;
        backdrop-filter: blur(12px);
        border-top: 2px solid rgba(255, 255, 255, 0.2);
    }

    .name-banner.creature-type-monster {
        background: linear-gradient(to top, rgba(220, 38, 38, 0.9) 0%, rgba(220, 38, 38, 0.7) 100%);
    }

    .name-banner.creature-type-ally {
        background: linear-gradient(to top, rgba(16, 185, 129, 0.9) 0%, rgba(16, 185, 129, 0.7) 100%);
    }

    .name-banner.creature-type-player {
        background: linear-gradient(to top, rgba(59, 130, 246, 0.9) 0%, rgba(59, 130, 246, 0.7) 100%);
    }

    .creature-name {
        font-size: 1.3em;
        font-weight: 700;
        text-align: center;
        word-break: break-word;
        line-height: 1.3;
        color: white;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
    }

    .detail-card.active-card .creature-name {
        font-size: 1.5em;
        font-weight: 800;
    }

    /* === HEALTH ICONS (in badge) === */
    .health-icons {
        display: flex;
        gap: 4px;
        align-items: center;
        justify-content: center;
    }

    .health-icons :global(svg) {
        width: 1.5em;
        height: 1.5em;
        color: white;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
    }

    .hp-icon {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .hp-icon :global(svg) {
        width: 1.5em;
        height: 1.5em;
        color: white;
        fill: currentColor;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
    }

    /* === MULTI-HEART DISPLAY (Active Card) === */
    .multi-hearts {
        display: flex;
        gap: 3px;
        align-items: center;
        justify-content: center;
    }

    .multi-hearts .heart-icon {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .multi-hearts .heart-icon :global(svg) {
        width: 40px;
        height: 40px;
        color: white;
        fill: currentColor;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
    }

    /* === CONDITIONS CONTAINER (Above name banner) === */
    .conditions-container {
        position: absolute;
        bottom: 62px; /* Just above name banner */
        left: 0;
        right: 0;
        max-height: 150px; /* Limit height to avoid covering too much */
        overflow-y: auto; /* Scrollable if many conditions */
        overflow-x: hidden;
        display: flex;
        flex-wrap: wrap; /* Horizontal wrapping layout */
        gap: 6px;
        padding: 8px 12px;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(12px);
        z-index: 5;
        border-top: 2px solid rgba(255, 255, 255, 0.2);
        justify-content: center; /* Center the chips */
    }

    :global(.theme-dark) .conditions-container {
        background: rgba(0, 0, 0, 0.85);
    }

    /* Custom scrollbar for conditions */
    .conditions-container::-webkit-scrollbar {
        width: 6px;
    }

    .conditions-container::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.3);
        border-radius: 3px;
    }

    .conditions-container::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 3px;
    }

    .conditions-container::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.5);
    }

    /* Condition chip/badge */
    .condition-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.25);
        backdrop-filter: blur(4px);
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: white;
        font-size: 0.85em;
        font-weight: 600;
        white-space: nowrap;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
        transition: all 0.2s ease;
    }

    .condition-chip:hover {
        background: rgba(255, 255, 255, 0.35);
        transform: scale(1.05);
    }

    :global(.theme-dark) .condition-chip {
        background: rgba(255, 255, 255, 0.2);
    }

    :global(.theme-dark) .condition-chip:hover {
        background: rgba(255, 255, 255, 0.3);
    }

    .condition-chip-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        color: currentColor;
    }

    .condition-chip-icon :global(svg) {
        width: 100%;
        height: 100%;
        fill: currentColor;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
    }

    .condition-chip-emoji {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.1em;
        line-height: 1;
        width: 16px;
        height: 16px;
    }

    .condition-chip-name {
        line-height: 1;
    }

    /* === INITIATIVE SIDEBAR === */
    .initiative-sidebar {
        flex: 1 1 auto;
        display: grid;
        grid-template-columns: 48px 1fr auto 90px;
        gap: 4px 10px;
        padding: 0;
        background: transparent;
        border-radius: 12px;
        overflow-y: auto;
        z-index: 10;
        align-items: center;
        align-content: start;
    }

    :global(.theme-dark) .initiative-sidebar {
        background: transparent;
    }

    /* === INITIATIVE ITEM === */
    .initiative-item {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: subgrid;
        align-items: center;
        padding: 8px 0;
        border-radius: 6px;
        transition: all 0.2s ease;
        font-size: 0.95em;
        color: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(8px);
    }

    .initiative-item.creature-type-monster {
        border-left: 3px solid #dc2626;
        background-color: rgba(220, 38, 38, 0.20);
    }

    .initiative-item.creature-type-ally {
        border-left: 3px solid #10b981;
        background-color: rgba(16, 185, 129, 0.20);
    }

    .initiative-item.creature-type-player {
        border-left: 3px solid #3b82f6;
        background-color: rgba(59, 130, 246, 0.20);
    }

    .initiative-item.active {
        background: rgba(251, 191, 36, 0.3);
        font-weight: 700;
        box-shadow:
            0 0 0 2px rgba(251, 191, 36, 0.5),
            0 0 12px rgba(251, 191, 36, 0.6),
            0 2px 8px rgba(0, 0, 0, 0.3);
    }

    :global(.theme-dark) .initiative-item.creature-type-monster {
        background-color: rgba(220, 38, 38, 0.25);
    }

    :global(.theme-dark) .initiative-item.creature-type-ally {
        background-color: rgba(16, 185, 129, 0.25);
    }

    :global(.theme-dark) .initiative-item.creature-type-player {
        background-color: rgba(59, 130, 246, 0.25);
    }

    :global(.theme-dark) .initiative-item.active {
        background: rgba(251, 191, 36, 0.25);
        box-shadow:
            0 0 0 2px rgba(251, 191, 36, 0.6),
            0 0 15px rgba(251, 191, 36, 0.7),
            0 2px 8px rgba(0, 0, 0, 0.5);
    }

    /* === AVATAR CONTAINER === */
    .avatar-container {
        position: relative;
        width: 40px;
        height: 40px;
        justify-self: center;
        margin: 0 4px;
    }

    /* === AVATAR IMAGE === */
    .avatar-image {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
        display: block;
        border: 2px solid;
        transition: all 0.2s ease;
    }

    .avatar-image.creature-type-monster {
        border-color: #dc2626;
    }

    .avatar-image.creature-type-ally {
        border-color: #10b981;
    }

    .avatar-image.creature-type-player {
        border-color: #3b82f6;
    }

    .initiative-item.active .avatar-image {
        border-color: #fbbf24;
        box-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
    }

    /* === AVATAR PLACEHOLDER === */
    .avatar-placeholder {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid;
        transition: all 0.2s ease;
    }

    .avatar-placeholder.creature-type-monster {
        background: linear-gradient(135deg, rgba(220, 38, 38, 0.9) 0%, rgba(153, 27, 27, 0.9) 100%);
        border-color: #dc2626;
    }

    .avatar-placeholder.creature-type-ally {
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.9) 0%, rgba(5, 150, 105, 0.9) 100%);
        border-color: #10b981;
    }

    .avatar-placeholder.creature-type-player {
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.9) 0%, rgba(37, 99, 235, 0.9) 100%);
        border-color: #3b82f6;
    }

    .initiative-item.active .avatar-placeholder {
        border-color: #fbbf24;
        box-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
    }

    .avatar-placeholder :global(svg) {
        width: 20px;
        height: 20px;
        opacity: 0.9;
        color: white;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
    }

    /* === INITIATIVE BADGE (SUBTLE) === */
    .init-badge {
        position: absolute;
        top: -2px;
        right: -2px;
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.75);
        color: rgba(255, 255, 255, 0.95);
        font-size: 0.65em;
        font-weight: 600;
        border: 1px solid rgba(255, 255, 255, 0.3);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
    }

    .init-badge.active-badge {
        background: #fbbf24;
        color: #000;
        font-weight: 700;
        border-color: #fbbf24;
        box-shadow: 0 0 6px rgba(251, 191, 36, 0.8);
    }

    .init-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin: 0 4px;
    }

    /* === SIDEBAR HEALTH === */
    .sidebar-health {
        display: flex;
        gap: 2px;
        align-items: center;
        justify-content: center;
        margin: 0 4px 0 10px;
        padding-left: 10px;
        padding-right: 8px;
    }

    .sidebar-hp-text {
        font-size: 0.85em;
        font-weight: 600;
        white-space: nowrap;
        color: rgba(255, 255, 255, 0.9);
    }

    .sidebar-health :global(svg) {
        width: 14px;
        height: 14px;
        opacity: 0.9;
        color: rgba(255, 255, 255, 0.85);
    }

    .sidebar-skull :global(svg) {
        color: rgba(255, 255, 255, 0.6);
    }

    .sidebar-heart :global(svg) {
        color: rgba(255, 255, 255, 0.85);
    }

    .sidebar-hp-icon {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .sidebar-hp-icon :global(svg) {
        width: 16px;
        height: 16px;
        opacity: 0.9;
        fill: currentColor;
        color: rgba(255, 255, 255, 0.85);
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
    }

    /* === MULTI-HEART DISPLAY (Sidebar) === */
    .multi-hearts-sidebar {
        display: flex;
        gap: 2px;
        align-items: center;
        justify-content: center;
    }

    .multi-hearts-sidebar .sidebar-heart-icon {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .multi-hearts-sidebar .sidebar-heart-icon :global(svg) {
        width: 24px;
        height: 24px;
        opacity: 0.9;
        fill: currentColor;
        color: rgba(255, 255, 255, 0.85);
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
    }

    /* === SIDEBAR CONDITIONS === */
    .sidebar-conditions {
        display: flex;
        gap: 4px;
        align-items: center;
        flex-wrap: wrap;
        margin: 0 4px;
    }

    .sidebar-condition-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        color: rgba(255, 255, 255, 0.85);
    }

    .sidebar-condition-icon :global(svg) {
        width: 100%;
        height: 100%;
        fill: currentColor;
        color: currentColor;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
    }

    .sidebar-condition-icon :global(svg path) {
        fill: currentColor;
    }

    .sidebar-condition-emoji {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        font-size: 1em;
        line-height: 1;
        color: rgba(255, 255, 255, 0.95);
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
    }

    .sidebar-condition-more {
        font-size: 0.75em;
        font-weight: 700;
        padding: 2px 4px;
        border-radius: 4px;
        background: rgba(251, 191, 36, 0.3);
        color: rgba(255, 255, 255, 0.95);
    }


    @media (prefers-reduced-motion: reduce) {
        .detail-card.active-card {
            animation: none;
        }
        .detail-card {
            transition: none !important;
        }
    }

    /* === BACKGROUND IMAGE === */
    .background-image {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        z-index: 0;
    }

    .background-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0.1) 0%,
            rgba(0, 0, 0, 0.2) 50%,
            rgba(0, 0, 0, 0.3) 100%
        );
        z-index: 1;
    }

    :global(.theme-dark) .background-overlay {
        background: linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0.2) 0%,
            rgba(0, 0, 0, 0.3) 50%,
            rgba(0, 0, 0, 0.4) 100%
        );
    }
</style>
