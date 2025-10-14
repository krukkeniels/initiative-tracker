<script lang="ts">
    import { setIcon } from "obsidian";
    import { fade } from "svelte/transition";
    import { SyncLoader } from "svelte-loading-spinners";
    import { onMount, onDestroy } from "svelte";

    import { AC, FRIENDLY, HP, INITIATIVE } from "src/utils";
    import type { Creature } from "src/utils/creature";
    import { createEventDispatcher } from "svelte";
    import type InitiativeTracker from "src/main";
    import { getConditionIconSvg } from "src/utils/condition-icons";
    import { getHpIconSvg } from "src/utils/hp-icons";

    import { tracker } from "../stores/tracker";
    const { state, ordered, data } = tracker;

    export let plugin: InitiativeTracker;

    // Carousel state
    let carouselContainer: HTMLElement;
    let visibleCardCount = 3; // Default
    let resizeObserver: ResizeObserver;

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

    // Calculate visible card count based on viewport
    onMount(() => {
        const calculateVisibleCards = () => {
            if (carouselContainer) {
                const cardWidth = 300; // 280px card + 20px gap
                const containerWidth = carouselContainer.offsetWidth;
                visibleCardCount = Math.max(1, Math.floor(containerWidth / cardWidth) + 1);
            }
        };

        // Initial calculation
        calculateVisibleCards();

        // Watch for resize
        resizeObserver = new ResizeObserver(calculateVisibleCards);
        if (carouselContainer) {
            resizeObserver.observe(carouselContainer);
        }
    });

    onDestroy(() => {
        if (resizeObserver) {
            resizeObserver.disconnect();
        }
    });

    // Generate looped display array: [Active, Next1, Next2, ..., wrapping around]
    $: displayCreatures = (() => {
        if (activeAndVisible.length === 0) return [];

        console.log("[PlayerView] Generating displayCreatures");
        console.log("[PlayerView] Total creatures:", activeAndVisible.length);
        activeAndVisible.forEach((c, idx) => {
            console.log(`[PlayerView] Creature ${idx}: ${c.getName()}`, {
                id: c.id,
                image: c.image,
                image_url: c.image_url,
                hasImage: !!(c.image || c.image_url)
            });
        });

        const activeIndex = activeAndVisible.findIndex(c => amIActive(c) && $state);

        // If no active, show first N creatures
        if (activeIndex === -1) {
            const result = [];
            for (let i = 0; i < Math.min(visibleCardCount, activeAndVisible.length); i++) {
                result.push({
                    creature: activeAndVisible[i],
                    displayId: `${activeAndVisible[i].id}-${i}`,
                    isActive: false
                });
            }
            return result;
        }

        const result = [];
        const totalCreatures = activeAndVisible.length;

        // Generate cards to fill viewport with looping
        for (let i = 0; i < visibleCardCount; i++) {
            const index = (activeIndex + i) % totalCreatures;
            result.push({
                creature: activeAndVisible[index],
                displayId: `${activeAndVisible[index].id}-${i}`,
                isActive: i === 0 // First card (active) is always position 0
            });
        }

        return result;
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

    // Debug helper for template logging
    const logCreatureImage = (creature: Creature) => {
        const hasImage = !!(creature.image || creature.image_url);
        const imageSrc = getImageUrl(creature.image || creature.image_url);
        console.log(`[PlayerView RENDER] ${creature.getName()}:`, {
            hasImage,
            image: creature.image,
            image_url: creature.image_url,
            finalSrc: imageSrc,
            conditionResult: hasImage
        });
        return true; // Always return true so it doesn't affect rendering
    };</script>

<div class="player-view-container" transition:fade>
    <!-- LEFT PANE: Detail Carousel -->
    <div class="carousel-container" bind:this={carouselContainer}>
        <div class="carousel-track">
            {#each displayCreatures as item (item.displayId)}
                {@const creature = item.creature}
                {@const _ = logCreatureImage(creature)}
                {@const imageUrl = getImageUrl(creature.image || creature.image_url)}
                <div
                    class="detail-card creature-type-{getCreatureType(creature)}"
                    class:active={item.isActive && $state}
                    data-creature-id={creature.id}
                >
                    <!-- Health Badge (Top-right corner) -->
                    <div class="health-badge {getHpStatus(creature.hp, creature.max).toLowerCase()}">
                        {#if creature.player && $data.diplayPlayerHPValues}
                            <div class="hp-text">{@html creature.hpDisplay}</div>
                        {:else}
                            {@const hpIcon = getHpIcon(creature)}
                            <div class="health-icons">
                                {#if hpIcon === "skull"}
                                    <span use:skullIcon />
                                {:else}
                                    <span class="hp-icon">{@html getHpIconSvg(hpIcon)}</span>
                                {/if}
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

                        <!-- Status Section (above name, only if statuses exist) -->
                        {#if creature.status.size > 0}
                            <div class="status-section">
                                {#each [...creature.status].slice(0, 2) as status}
                                    <span class="status-badge">
                                        {#if status.icon}
                                            <span class="status-icon">
                                                {@html getConditionIconSvg(status.icon)}
                                            </span>
                                        {/if}
                                        <span class="status-name">{status.name}</span>
                                    </span>
                                {/each}
                                {#if creature.status.size > 2}
                                    <span class="status-badge status-more">+{creature.status.size - 2}</span>
                                {/if}
                            </div>
                        {/if}

                        <!-- Name Banner (overlays bottom of image) -->
                        <div class="name-banner creature-type-{getCreatureType(creature)}">
                            <div class="creature-name">{name(creature)}</div>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    </div>

    <!-- BOTTOM PANE: Active Creature Condition Details -->
    {#if displayCreatures.find(item => item.isActive)?.creature?.status.size > 0}
        {@const activeCreature = displayCreatures.find(item => item.isActive)?.creature}
        <div class="condition-details-section" transition:fade>
            <div class="condition-details-header">ACTIVE CONDITIONS</div>
            <div class="condition-cards-grid">
                {#each [...activeCreature.status] as condition (condition.id)}
                    <div class="condition-card creature-type-{getCreatureType(activeCreature)}">
                        {#if condition.icon}
                            <div class="condition-card-icon">
                                {@html getConditionIconSvg(condition.icon)}
                            </div>
                        {/if}
                        <div class="condition-card-content">
                            <div class="condition-card-name">{condition.name}</div>
                            <div class="condition-card-description">{condition.description}</div>
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    <!-- RIGHT PANE: Initiative Sidebar -->
    <div class="initiative-sidebar">
        <div class="sidebar-header">INITIATIVE</div>
        {#each activeAndVisible as creature (creature.id)}
            <div
                class="initiative-item creature-type-{getCreatureType(creature)}"
                class:active={amIActive(creature) && $state}
            >
                <div class="init-main-row">
                    <span class="init-number">{creature.initiative}</span>
                    <span class="init-name">{name(creature)}</span>
                </div>

                <div class="init-details-row">
                    <!-- Health Icons -->
                    {#if creature.player && $data.diplayPlayerHPValues}
                        <div class="sidebar-health">
                            <span class="sidebar-hp-text">{@html creature.hpDisplay}</span>
                        </div>
                    {:else}
                        {@const hpIcon = getHpIcon(creature)}
                        <div class="sidebar-health">
                            {#if hpIcon === "skull"}
                                <span use:skullIcon class="sidebar-skull" />
                            {:else}
                                <span class="sidebar-hp-icon">{@html getHpIconSvg(hpIcon)}</span>
                            {/if}
                        </div>
                    {/if}

                    <!-- Separator -->
                    {#if creature.status.size > 0}
                        <span class="sidebar-divider">|</span>
                    {/if}

                    <!-- Condition Icons -->
                    {#if creature.status.size > 0}
                        <div class="sidebar-conditions">
                            {#each [...creature.status].slice(0, 3) as status}
                                {#if status.icon}
                                    <span class="sidebar-condition-icon" title={status.name}>
                                        {@html getConditionIconSvg(status.icon)}
                                    </span>
                                {/if}
                            {/each}
                            {#if creature.status.size > 3}
                                <span class="sidebar-condition-more">+{creature.status.size - 3}</span>
                            {/if}
                        </div>
                    {/if}
                </div>
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
    }

    /* === CAROUSEL === */
    .carousel-container {
        width: 100%;
        height: 100%;
        overflow: visible; /* Allow active card scale to show */
        position: relative;
        display: flex;
        align-items: center;
    }

    .carousel-track {
        display: flex;
        gap: 20px;
        padding: 30px 20px; /* More vertical padding for scaled cards */
        overflow: visible; /* Show full cards */
        justify-content: flex-start;
        align-items: center;
        width: 100%;
    }

    /* === DETAIL CARD === */
    .detail-card {
        flex: 0 0 280px;
        height: 420px;
        display: flex;
        flex-direction: column;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        transition: all 0.3s ease;
        position: relative;
        overflow: visible; /* Allow health badge to overflow */
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
    .detail-card.active {
        transform: scale(1.08);
        box-shadow:
            0 0 0 3px rgba(251, 191, 36, 0.4),
            0 0 35px rgba(251, 191, 36, 0.6),
            0 8px 20px rgba(0, 0, 0, 0.3);
        background-color: rgba(251, 191, 36, 0.2) !important;
        z-index: 10;
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
        background: linear-gradient(135deg, rgba(220, 38, 38, 0.3) 0%, rgba(153, 27, 27, 0.5) 100%);
    }

    .no-image-placeholder.creature-type-ally {
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.3) 0%, rgba(5, 150, 105, 0.5) 100%);
    }

    .no-image-placeholder.creature-type-player {
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(37, 99, 235, 0.5) 100%);
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

    .detail-card.active .creature-name {
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

    /* === STATUS SECTION (Above name banner) === */
    .status-section {
        position: absolute;
        bottom: 62px; /* Just above name banner */
        left: 0;
        right: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        justify-content: center;
        padding: 8px 12px;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(8px);
        z-index: 5;
    }

    :global(.theme-dark) .status-section {
        background: rgba(0, 0, 0, 0.75);
    }

    .status-badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.25);
        color: white;
        font-size: 0.85em;
        font-weight: 600;
        white-space: nowrap;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .status-more {
        background: rgba(251, 191, 36, 0.9);
        color: #000;
        font-weight: 700;
        border-color: rgba(251, 191, 36, 0.5);
    }

    /* === INITIATIVE SIDEBAR OVERLAY === */
    .initiative-sidebar {
        position: absolute;
        top: 0;
        right: 0;
        width: auto;
        min-width: 220px;
        max-width: 300px;
        max-height: calc(100% - 32px);
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 16px;
        background: rgba(0, 0, 0, 0.15);
        border-radius: 12px;
        overflow-y: auto;
        z-index: 100;
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    :global(.theme-dark) .initiative-sidebar {
        background: rgba(0, 0, 0, 0.4);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }

    .sidebar-header {
        font-size: 1.1em;
        font-weight: 700;
        text-align: center;
        padding: 8px;
        margin-bottom: 8px;
        border-bottom: 2px solid var(--background-modifier-border);
        letter-spacing: 0.05em;
    }

    /* === INITIATIVE ITEM === */
    .initiative-item {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px 12px;
        border-radius: 6px;
        transition: all 0.2s ease;
        font-size: 0.95em;
    }

    .initiative-item.creature-type-monster {
        border-left: 3px solid #dc2626;
        background-color: rgba(220, 38, 38, 0.08);
    }

    .initiative-item.creature-type-ally {
        border-left: 3px solid #10b981;
        background-color: rgba(16, 185, 129, 0.08);
    }

    .initiative-item.creature-type-player {
        border-left: 3px solid #3b82f6;
        background-color: rgba(59, 130, 246, 0.08);
    }

    .initiative-item.active {
        background: rgba(251, 191, 36, 0.3);
        font-weight: 700;
        transform: scale(1.05);
        box-shadow:
            0 0 0 2px rgba(251, 191, 36, 0.5),
            0 0 12px rgba(251, 191, 36, 0.6),
            0 2px 8px rgba(0, 0, 0, 0.3);
    }

    :global(.theme-dark) .initiative-item.creature-type-monster {
        background-color: rgba(220, 38, 38, 0.12);
    }

    :global(.theme-dark) .initiative-item.creature-type-ally {
        background-color: rgba(16, 185, 129, 0.12);
    }

    :global(.theme-dark) .initiative-item.creature-type-player {
        background-color: rgba(59, 130, 246, 0.12);
    }

    :global(.theme-dark) .initiative-item.active {
        background: rgba(251, 191, 36, 0.25);
        box-shadow:
            0 0 0 2px rgba(251, 191, 36, 0.6),
            0 0 15px rgba(251, 191, 36, 0.7),
            0 2px 8px rgba(0, 0, 0, 0.5);
    }

    /* Main row with initiative number and name */
    .init-main-row {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .init-number {
        flex: 0 0 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: var(--background-modifier-border);
        font-weight: 600;
        font-size: 0.95em;
    }

    .initiative-item.active .init-number {
        background: #fbbf24;
        color: #000;
        font-weight: 700;
    }

    .init-name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* Details row with health and conditions */
    .init-details-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-left: 42px; /* Align with name (32px init number + 10px gap) */
        font-size: 0.9em;
    }

    .sidebar-divider {
        color: var(--text-muted);
        opacity: 0.5;
        margin: 0 4px;
    }

    /* === SIDEBAR HEALTH === */
    .sidebar-health {
        display: flex;
        gap: 2px;
        align-items: center;
    }

    .sidebar-hp-text {
        font-size: 0.85em;
        font-weight: 600;
        white-space: nowrap;
    }

    .sidebar-health :global(svg) {
        width: 14px;
        height: 14px;
        opacity: 0.9;
    }

    .sidebar-skull :global(svg) {
        color: var(--text-muted);
    }

    .sidebar-heart :global(svg) {
        color: var(--text-error);
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
        color: var(--text-error);
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
    }

    /* === SIDEBAR CONDITIONS === */
    .sidebar-conditions {
        display: flex;
        gap: 4px;
        align-items: center;
    }

    .sidebar-condition-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        opacity: 0.8;
        color: var(--text-normal);
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

    .sidebar-condition-more {
        font-size: 0.75em;
        font-weight: 700;
        padding: 2px 4px;
        border-radius: 4px;
        background: rgba(251, 191, 36, 0.3);
        color: var(--text-normal);
    }

    /* === STATUS BADGE UPDATES === */
    .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.25);
        color: white;
        font-size: 0.85em;
        font-weight: 600;
        white-space: nowrap;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .status-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        color: currentColor;
    }

    .status-icon :global(svg) {
        width: 100%;
        height: 100%;
        fill: currentColor;
        color: currentColor;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
    }

    .status-icon :global(svg path) {
        fill: currentColor;
    }

    .status-name {
        line-height: 1;
    }

    /* === CONDITION DETAILS SECTION === */
    .condition-details-section {
        position: absolute;
        bottom: 12px;
        left: 12px;
        right: 12px; /* Use full width */
        max-height: 160px;
        overflow-y: auto;
        background: rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(12px);
        border-radius: 8px;
        padding: 10px 12px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        z-index: 50;
    }

    :global(.theme-dark) .condition-details-section {
        background: rgba(0, 0, 0, 0.4);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }

    .condition-details-header {
        font-size: 0.85em;
        font-weight: 700;
        text-align: center;
        padding: 0 0 8px 0;
        border-bottom: 1px solid var(--background-modifier-border);
        letter-spacing: 0.05em;
        margin-bottom: 8px;
        opacity: 0.9;
    }

    .condition-cards-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 8px;
        max-height: 110px;
        overflow-y: auto;
    }

    /* === CONDITION CARD === */
    .condition-card {
        display: flex;
        gap: 8px;
        padding: 8px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        transition: all 0.2s ease;
    }

    .condition-card:hover {
        background: rgba(255, 255, 255, 0.15);
        transform: translateY(-1px);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    }

    :global(.theme-dark) .condition-card {
        background: rgba(255, 255, 255, 0.08);
    }

    :global(.theme-dark) .condition-card:hover {
        background: rgba(255, 255, 255, 0.12);
    }

    /* Creature type borders for condition cards */
    .condition-card.creature-type-monster {
        border-left: 3px solid #dc2626;
    }

    .condition-card.creature-type-ally {
        border-left: 3px solid #10b981;
    }

    .condition-card.creature-type-player {
        border-left: 3px solid #3b82f6;
    }

    .condition-card-icon {
        flex: 0 0 32px;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-normal);
    }

    .condition-card-icon :global(svg) {
        width: 100%;
        height: 100%;
        fill: currentColor;
        filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.3));
    }

    .condition-card-content {
        flex: 1;
        min-width: 0;
    }

    .condition-card-name {
        font-size: 0.95em;
        font-weight: 700;
        margin-bottom: 4px;
        color: var(--text-normal);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .condition-card-description {
        font-size: 0.8em;
        line-height: 1.4;
        color: var(--text-muted);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* Scrollbar styling for condition cards grid */
    .condition-cards-grid::-webkit-scrollbar {
        width: 6px;
    }

    .condition-cards-grid::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.1);
        border-radius: 3px;
    }

    .condition-cards-grid::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 3px;
    }

    .condition-cards-grid::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.4);
    }

    @media (prefers-reduced-motion: reduce) {
        .detail-card.active {
            animation: none;
        }
    }
</style>
