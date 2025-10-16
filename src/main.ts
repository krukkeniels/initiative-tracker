import {
    type FrontMatterCache,
    Notice,
    parseYaml,
    Plugin,
    TFile,
    WorkspaceLeaf,
    setIcon
} from "obsidian";

import {
    BUILDER_VIEW,
    Conditions,
    CREATURE_TRACKER_VIEW,
    DEFAULT_SETTINGS,
    INITIATIVE_TRACKER_VIEW,
    registerIcons
} from "./utils";

import { PLAYER_VIEW_VIEW } from "./utils/constants";
import type { InitiativeTrackerData } from "./settings/settings.types";
import type { InitiativeViewState } from "./tracker/view.types";
import type { HomebrewCreature } from "./types/creatures";
import type { SRDMonster } from "./types/creatures";
import InitiativeTrackerSettings from "./settings/settings";
import { EncounterBlock, EncounterParser } from "./encounter";
import EncounterLine from "./encounter/ui/EncounterLine.svelte";
import { Creature, getId } from "./utils/creature";
import TrackerView, { CreatureView } from "./tracker/view";
import BuilderView from "./builder/view";
import PlayerView from "./tracker/player-view";
import { tracker } from "./tracker/stores/tracker";
import { EncounterSuggester } from "./encounter/editor-suggestor";
import { API } from "./api/api";

import "@javalent/fantasy-statblocks";
import type { StackRoller } from "@javalent/dice-roller";

export default class InitiativeTracker extends Plugin {
    api = new API(this);
    public data: InitiativeTrackerData;
    public tracker = tracker;
    playerCreatures: Map<string, Creature> = new Map();
    watchers: Map<TFile, HomebrewCreature> = new Map();
    getRoller(str: string) {
        if (!this.canUseDiceRoller) return;
        const roller = window.DiceRoller.getRoller(str, "statblock");
        if (roller === null) return null;
        return roller as StackRoller;
    }
    get canUseDiceRoller() {
        if (window.DiceRoller != null) {
            if (!window.DiceRoller.getRoller) {
                new Notice(
                    "Please update Dice Roller to the latest version to use with Initiative Tracker."
                );
            } else {
                return true;
            }
        }
        return false;
    }

    getInitiativeValue(modifier: number | number[] = 0): number {
        const defaultIfNoResult =
            Math.floor(Math.random() * 19 + 1) +
            [modifier].flat().reduce((a, b) => a + b, 0);
        if (!this.canUseDiceRoller) {
            return defaultIfNoResult;
        }
        let dice = this.data.initiative;
        if (typeof modifier == "number") {
            dice = dice.replace(/%mod\d?%/g, `${modifier}`);
        } else {
            for (let i = 0; i < modifier.length; i++) {
                dice = dice.replace(`%mod${i + 1}%`, `${modifier[i]}`);
            }
        }
        const roller = this.getRoller(dice);
        const initiative = roller?.rollSync() ?? defaultIfNoResult;
        if (isNaN(initiative)) return defaultIfNoResult;
        return initiative;
    }

    getPlayerByName(name: string) {
        if (!this.players.has(name)) return new Creature({ name });
        return Creature.from(this.players.get(name));
    }
    getPlayerNamesForParty(party: string): string[] {
        return this.data.parties?.find((p) => p.name === party)?.players ?? [];
    }
    getPlayersForParty(party: string) {
        return (
            this.data.parties
                ?.find((p) => p.name == party)
                ?.players.map((p) => this.getPlayerByName(p))
                ?.filter((p) => p) ?? []
        );
    }

    get canUseStatBlocks(): boolean {
        if (this.app.plugins.enabledPlugins.has("obsidian-5e-statblocks")) {
            return (window["FantasyStatblocks"]?.getVersion()?.major ?? 0) >= 4;
        }
        return false;
    }
    get statblockVersion() {
        return window.FantasyStatblocks?.getVersion() ?? { major: 0 };
    }
    get statblock_creatures() {
        if (!window.FantasyStatblocks) return [];
        return window.FantasyStatblocks.getBestiaryCreatures() as SRDMonster[];
    }
    get bestiary() {
        return this.statblock_creatures.filter(
            (p) => !p.player && p.bestiary !== false
        );
    }

    addEncounter(name: string, encounter: InitiativeViewState) {
        this.data.encounters[name] = encounter;
        this.registerCommand(name);
    }
    removeEncounter(name: string) {
        delete this.data.encounters[name];
        this.unregisterCommandsFor(name);
    }

    registerCommand(encounter: string) {
        this.addCommand({
            id: `start-${encounter}`,
            name: `Start ${encounter}`,
            checkCallback: (checking) => {
                // checking if the command should appear in the Command Palette
                if (checking) {
                    // make sure the active view is a MarkdownView.
                    return encounter in this.data.encounters;
                }
                if (!(encounter in this.data.encounters)) return;
                tracker.new(this, this.data.encounters[encounter]);
            }
        });
    }
    unregisterCommandsFor(encounter: string) {
        if (
            this.app.commands.findCommand(
                `initiative-tracker:start-${encounter}`
            )
        ) {
            delete this.app.commands.commands[
                `initiative-tracker:start-${encounter}`
            ];
        }
    }

    get bestiaryNames(): string[] {
        if (!window.FantasyStatblocks) return [];
        return window.FantasyStatblocks.getBestiaryNames();
    }
    get view() {
        const leaves = this.app.workspace.getLeavesOfType(
            INITIATIVE_TRACKER_VIEW
        );
        const leaf = leaves?.length ? leaves[0] : null;
        if (leaf && leaf.view && leaf.view instanceof TrackerView)
            return leaf.view;
    }
    get combatant() {
        const leaves = this.app.workspace.getLeavesOfType(
            CREATURE_TRACKER_VIEW
        );
        const leaf = leaves?.length ? leaves[0] : null;
        if (leaf && leaf.view && leaf.view instanceof CreatureView)
            return leaf.view;
    }

    get defaultParty() {
        return this.data.parties.find((p) => p.name == this.data.defaultParty);
    }

    getBaseCreatureFromBestiary(name: string): SRDMonster {
        /** Check statblocks */
        try {
            if (
                this.canUseStatBlocks &&
                window.FantasyStatblocks.hasCreature(name)
            ) {
                return window.FantasyStatblocks.getCreatureFromBestiary(
                    name
                ) as SRDMonster;
            }
        } catch (e) {}
        return null;
    }
    getCreatureFromBestiary(name: string) {
        let creature = this.getBaseCreatureFromBestiary(name);
        if (creature) return Creature.from(creature);
    }
    getCreatureFromBestiaryByDefinition(
        creature: SRDMonster | HomebrewCreature
    ): Creature {
        if (creature.player && this.playerCreatures.has(creature.name)) {
            return this.playerCreatures.get(creature.name);
        }
        return (
            this.getCreatureFromBestiary(creature.name) ??
            Creature.from(creature)
        );
    }
    get statblock_players() {
        return this.statblock_creatures
            .filter((p) => p.player)
            .map((p) => [p.name, Creature.from(p)] as [string, Creature]);
    }
    get players() {
        return new Map([
            ...this.playerCreatures.entries(),
            ...this.statblock_players
        ]);
    }

    async onload() {
        registerIcons();

        await this.loadSettings();

        this.setBuilderIcon();

        this.addSettingTab(new InitiativeTrackerSettings(this));

        this.registerView(
            INITIATIVE_TRACKER_VIEW,
            (leaf: WorkspaceLeaf) => new TrackerView(leaf, this)
        );
        this.registerView(
            PLAYER_VIEW_VIEW,
            (leaf: WorkspaceLeaf) => new PlayerView(leaf, this)
        );
        this.registerView(
            CREATURE_TRACKER_VIEW,
            (leaf: WorkspaceLeaf) => new CreatureView(leaf, this)
        );
        this.registerView(
            BUILDER_VIEW,
            (leaf: WorkspaceLeaf) => new BuilderView(leaf, this)
        );

        this.addCommands();
        this.addEvents();

        this.registerEditorSuggest(new EncounterSuggester(this));
        this.registerMarkdownCodeBlockProcessor("encounter", (src, el, ctx) => {
            if (
                this.canUseStatBlocks &&
                !window["FantasyStatblocks"].isResolved()
            ) {
                el.addClasses(["waiting-for-bestiary", "is-loading"]);
                const loading = el.createEl("p", {
                    text: "Waiting for Fantasy Statblocks Bestiary..."
                });
                const unload = window["FantasyStatblocks"].onResolved(() => {
                    el.removeClasses(["waiting-for-bestiary", "is-loading"]);
                    loading.detach();
                    const handler = new EncounterBlock(this, src, el);
                    ctx.addChild(handler);
                    unload();
                });
            } else {
                const handler = new EncounterBlock(this, src, el);
                ctx.addChild(handler);
            }
        });
        this.registerMarkdownCodeBlockProcessor(
            "encounter-table",
            (src, el, ctx) => {
                if (
                    this.canUseStatBlocks &&
                    !window["FantasyStatblocks"].isResolved()
                ) {
                    el.addClasses(["waiting-for-bestiary", "is-loading"]);
                    const loading = el.createEl("p", {
                        text: "Waiting for Fantasy Statblocks Bestiary..."
                    });
                    const unload = window["FantasyStatblocks"].onResolved(
                        () => {
                            el.removeClasses([
                                "waiting-for-bestiary",
                                "is-loading"
                            ]);
                            loading.detach();
                            const handler = new EncounterBlock(
                                this,
                                src,
                                el,
                                true
                            );
                            ctx.addChild(handler);
                            unload();
                        }
                    );
                } else {
                    const handler = new EncounterBlock(this, src, el, true);
                    ctx.addChild(handler);
                }
            }
        );

        this.registerMarkdownPostProcessor(async (el, ctx) => {
            if (!el || !el.firstElementChild) return;

            const codeEls = el.querySelectorAll<HTMLElement>("code");
            if (!codeEls || !codeEls.length) return;

            const codes = Array.from(codeEls).filter((code) =>
                /^encounter:\s/.test(code.innerText)
            );
            if (!codes.length) return;

            for (const code of codes) {
                const target = createSpan("initiative-tracker-encounter-line");

                code.replaceWith(target);

                const buildEncounter = async () => {
                    const definitions = code.innerText.replace(
                        `encounter:`,
                        ""
                    );

                    const creatures = parseYaml("[" + definitions.trim() + "]");
                    const parser = new EncounterParser(this);
                    const parsed = await parser.parse({ creatures });

                    if (
                        !parsed ||
                        !parsed.creatures ||
                        !parsed.creatures.size
                    ) {
                        target.setText("No creatures found.");
                        return;
                    }
                    new EncounterLine({
                        target,
                        props: {
                            ...parsed,
                            plugin: this
                        }
                    });
                };
                if (
                    this.canUseStatBlocks &&
                    !window["FantasyStatblocks"].isResolved()
                ) {
                    const loading = target.createSpan(
                        "waiting-for-bestiary inline"
                    );
                    const delay = Math.floor(200 * Math.random());

                    setIcon(
                        loading.createDiv({
                            cls: "icon",
                            attr: {
                                style: `animation-delay: ${delay}ms`
                            }
                        }),
                        "loader-2"
                    );
                    loading.createEl("em", {
                        text: "Loading Bestiary..."
                    });
                    const unload = window["FantasyStatblocks"].onResolved(
                        () => {
                            el.removeClasses([
                                "waiting-for-bestiary",
                                "inline"
                            ]);
                            loading.detach();
                            buildEncounter();
                            unload();
                        }
                    );
                } else {
                    buildEncounter();
                }
            }
        });

        for (const player of this.data.players) {
            if (player.currentHP === undefined && typeof player.hp === "number") {
                player.currentHP = player.hp;
            }
        }
        this.playerCreatures = new Map(
            this.data.players.map((p) => [p.name, Creature.from(p)])
        );

        this.app.workspace.onLayoutReady(async () => {
            this.addTrackerView();
            //Update players from < 7.2
            for (const player of this.data.players) {
                if (player.path) continue;
                if (!player.note) continue;
                const file = await this.app.metadataCache.getFirstLinkpathDest(
                    player.note,
                    ""
                );
                if (
                    !file ||
                    !this.app.metadataCache.getFileCache(file)?.frontmatter
                ) {
                    new Notice(
                        `Initiative Tracker: There was an issue with the linked note for ${player.name}.\n\nPlease re-link it in settings.`
                    );
                    continue;
                }
            }
            this.registerEvent(
                this.app.metadataCache.on("changed", (file) => {
                    if (!(file instanceof TFile)) return;
                    const players = this.data.players.filter(
                        (p) => p.path == file.path
                    );
                    if (!players.length) return;
                    const frontmatter: FrontMatterCache =
                        this.app.metadataCache.getFileCache(file)?.frontmatter;
                    if (!frontmatter) return;
                    const parseNumber = (value: unknown): number | undefined => {
                        if (value === null || value === undefined || value === "") {
                            return undefined;
                        }
                        const parsed = Number(value);
                        return Number.isFinite(parsed) ? parsed : undefined;
                    };
                    for (let player of players) {
                        const { ac, hp, modifier, level, name, image, image_url } = frontmatter;
                        const rawMaxHp =
                            frontmatter["max_hp"] ??
                            frontmatter["maxHp"];
                        const rawCurrentHp =
                            hp ??
                            frontmatter["current_hp"] ??
                            frontmatter["currentHP"];

                        const storedMaxHp = parseNumber(player.hp);
                        const storedCurrentHp = parseNumber(player.currentHP);

                        const parsedMaxHp = parseNumber(rawMaxHp);
                        const parsedCurrentHp = parseNumber(rawCurrentHp);

                        const resolvedMaxHp =
                            parsedMaxHp ??
                            storedMaxHp ??
                            parsedCurrentHp ??
                            undefined;
                        let resolvedCurrentHp =
                            parsedCurrentHp ??
                            storedCurrentHp ??
                            resolvedMaxHp ??
                            undefined;

                        if (
                            resolvedCurrentHp !== undefined &&
                            resolvedMaxHp !== undefined &&
                            resolvedCurrentHp > resolvedMaxHp
                        ) {
                            resolvedCurrentHp = resolvedMaxHp;
                        }

                        player.ac = ac;
                        if (resolvedMaxHp !== undefined) {
                            player.hp = resolvedMaxHp;
                            player.max_hp = resolvedMaxHp;
                        }
                        if (resolvedCurrentHp !== undefined) {
                            player.currentHP = resolvedCurrentHp;
                        } else if (
                            player.currentHP === undefined &&
                            player.hp !== undefined
                        ) {
                            player.currentHP = player.hp;
                        }
                        player.modifier = modifier;
                        player.level = level;
                        player.name = name ? name : player.name;
                        player["statblock-link"] =
                            frontmatter["statblock-link"];
                        player.image = image;
                        player.image_url = image_url;

                        this.playerCreatures.set(
                            player.name,
                            Creature.from(player)
                        );
                        if (this.view) {
                            const creature = tracker
                                .getOrderedCreatures()
                                .find((c) => c.name == player.name);
                            if (creature) {
                                tracker.updateCreatures({
                                    creature,
                                    change: {
                                        set_max_hp: player.hp,
                                        set_hp: player.currentHP,
                                        ac: player.ac
                                    }
                                });
                            }
                        }
                    }
                })
            );
            this.registerEvent(
                this.app.vault.on("rename", (file, old) => {
                    if (!(file instanceof TFile)) return;
                    const players = this.data.players.filter(
                        (p) => p.path == old
                    );
                    if (!players.length) return;
                    for (const player of players) {
                        player.path = file.path;
                        player.note = file.basename;
                    }
                })
            );
            this.registerEvent(
                this.app.vault.on("delete", (file) => {
                    if (!(file instanceof TFile)) return;
                    const players = this.data.players.filter(
                        (p) => p.path == file.path
                    );
                    if (!players.length) return;
                    for (const player of players) {
                        player.path = null;
                        player.note = null;
                    }
                })
            );

            // Listen for Fantasy Statblocks bestiary updates
            if (this.canUseStatBlocks) {
                this.registerEvent(
                    this.app.workspace.on("fantasy-statblocks:bestiary:updated", () => {
                        this.updateCreaturesFromBestiary();
                    })
                );
            }
        });

        console.log("Initiative Tracker v" + this.manifest.version + " loaded");
    }

    addCommands() {
        this.addCommand({
            id: "open-tracker",
            name: "Open Initiative Tracker",
            checkCallback: (checking) => {
                if (!this.view) {
                    if (!checking) {
                        this.addTrackerView();
                    }
                    return true;
                }
            }
        });
        this.addCommand({
            id: "open-builder",
            name: "Open Encounter Builder",
            checkCallback: (checking) => {
                if (!this.builder) {
                    if (!checking) {
                        this.addBuilderView();
                    }
                    return true;
                }
            }
        });

        this.addCommand({
            id: "toggle-encounter",
            name: "Toggle Encounter",
            checkCallback: (checking) => {
                const view = this.view;
                if (view) {
                    if (!checking) {
                        tracker.toggleState();
                    }
                    return true;
                }
            }
        });

        this.addCommand({
            id: "next-combatant",
            name: "Next Combatant",
            checkCallback: (checking) => {
                const view = this.view;
                if (view && tracker.getState()) {
                    if (!checking) {
                        tracker.goToNext();
                    }
                    return true;
                }
            }
        });

        this.addCommand({
            id: "prev-combatant",
            name: "Previous Combatant",
            checkCallback: (checking) => {
                const view = this.view;
                if (view && tracker.getState()) {
                    if (!checking) {
                        tracker.goToPrevious();
                    }
                    return true;
                }
            }
        });

        for (const encounter in this.data.encounters) {
            this.registerCommand(encounter);
        }
    }

    addEvents() {
        this.registerEvent(
            this.app.workspace.on(
                "initiative-tracker:should-save",
                async () => await this.saveSettings()
            )
        );
        this.registerEvent(
            app.workspace.on(
                "initiative-tracker:save-state",
                async (state: InitiativeViewState) => {
                    this.data.state = state;
                    await this.saveSettings();
                }
            )
        );
        this.registerEvent(
            this.app.workspace.on(
                "initiative-tracker:start-encounter",
                async (homebrews: HomebrewCreature[]) => {
                    try {
                        const creatures = homebrews.map((h) =>
                            Creature.from(h).toJSON()
                        );

                        const view = this.view;
                        if (!view) {
                            await this.addTrackerView();
                        }
                        if (view) {
                            tracker?.new(this, {
                                creatures,
                                state: false,
                                name: null,
                                round: 1,
                                logFile: null,
                                roll: true
                            });
                            this.app.workspace.revealLeaf(view.leaf);
                        } else {
                            new Notice(
                                "Could not find the Initiative Tracker. Try reloading the note!"
                            );
                        }
                    } catch (e) {
                        new Notice(
                            "There was an issue launching the encounter.\n\n" +
                                (e as Error).message
                        );
                        console.error(e);
                        return;
                    }
                }
            )
        );
        this.registerEvent(
            this.app.workspace.on(
                "initiative-tracker:stop-viewing",
                () => {
                    tracker.setViewingCreature(null);
                }
            )
        );
    }

    async onunload() {
        await this.saveSettings();
        this.app.workspace.trigger("initiative-tracker:unloaded");
        console.log("Initiative Tracker unloaded");
    }

    async addTrackerView() {
        if (
            this.app.workspace.getLeavesOfType(INITIATIVE_TRACKER_VIEW)?.length
        ) {
            return;
        }
        await this.app.workspace.getRightLeaf(false).setViewState({
            type: INITIATIVE_TRACKER_VIEW
        });
    }
    get builder() {
        const leaves = this.app.workspace.getLeavesOfType(BUILDER_VIEW);
        const leaf = leaves.length ? leaves[0] : null;
        if (leaf && leaf.view && leaf.view instanceof BuilderView)
            return leaf.view;
    }
    async addBuilderView() {
        if (this.app.workspace.getLeavesOfType(BUILDER_VIEW)?.length) {
            return;
        }
        await this.app.workspace.getLeaf(true).setViewState({
            type: BUILDER_VIEW
        });
        this.app.workspace.revealLeaf(this.builder.leaf);
    }
    async updatePlayer(existing: HomebrewCreature, player: HomebrewCreature) {
        if (!this.playerCreatures.has(existing.name)) {
            await this.savePlayer(player);
            return;
        }

        if (player.currentHP === undefined && typeof player.hp === "number") {
            player.currentHP = player.hp;
        }
        if (
            player.currentHP !== undefined &&
            player.hp !== undefined &&
            player.currentHP > player.hp
        ) {
            player.currentHP = player.hp;
        }
        if (player.hp !== undefined) {
            player.max_hp = player.hp;
        }

        const creature = this.playerCreatures.get(existing.name);
        creature.update(player);

        this.data.players.splice(
            this.data.players.indexOf(existing),
            1,
            player
        );

        this.playerCreatures.delete(existing.name);
        this.playerCreatures.set(player.name, creature);

        const view = this.view;
        if (view) {
            tracker.updateState();
        }

        await this.saveSettings();
    }

    async savePlayer(player: HomebrewCreature) {
        if (player.currentHP === undefined && typeof player.hp === "number") {
            player.currentHP = player.hp;
        }
        if (
            player.currentHP !== undefined &&
            player.hp !== undefined &&
            player.currentHP > player.hp
        ) {
            player.currentHP = player.hp;
        }
        if (player.hp !== undefined) {
            player.max_hp = player.hp;
        }
        this.data.players.push(player);
        this.playerCreatures.set(player.name, Creature.from(player));
        await this.saveSettings();
    }
    async savePlayers(...players: HomebrewCreature[]) {
        for (let monster of players) {
            if (monster.currentHP === undefined && typeof monster.hp === "number") {
                monster.currentHP = monster.hp;
            }
            if (
                monster.currentHP !== undefined &&
                monster.hp !== undefined &&
                monster.currentHP > monster.hp
            ) {
                monster.currentHP = monster.hp;
            }
            if (monster.hp !== undefined) {
                monster.max_hp = monster.hp;
            }
            this.data.players.push(monster);
            this.playerCreatures.set(monster.name, Creature.from(monster));
        }
        await this.saveSettings();
    }

    async deletePlayer(player: HomebrewCreature) {
        this.data.players = this.data.players.filter((p) => p != player);
        this.playerCreatures.delete(player.name);
        await this.saveSettings();
    }

    async loadSettings() {
        const data = Object.assign(
            {},
            { ...DEFAULT_SETTINGS },
            await this.loadData()
        );

        this.data = data;
        if (this.data.statuses?.some((c) => !c.id)) {
            for (const condition of this.data.statuses) {
                condition.id =
                    condition.id ??
                    Conditions.find((c) => c.name == condition.name)?.id ??
                    getId();
            }
            await this.saveSettings();
        }

        this.data.version = this.manifest.version
            .split(".")
            .map((n) => Number(n));
    }

    async saveSettings() {
        await this.saveData(this.data);
        tracker.setData(this.data);
    }
    async openCombatant(creature: Creature) {
        if (!this.canUseStatBlocks) return;
        const view = this.combatant;
        if (!view) {
            const leaf = this.app.workspace.getRightLeaf(true);
            await leaf.setViewState({
                type: CREATURE_TRACKER_VIEW
            });
        }

        await this.combatant.render(creature);
        this.app.workspace.revealLeaf(this.combatant.leaf);
        tracker.setViewingCreature(creature);
    }
    private _builderIcon: HTMLElement;
    setBuilderIcon() {
        if (this.data.builder.sidebarIcon) {
            this._builderIcon = this.addRibbonIcon(
                BUILDER_VIEW,
                "Initiative Tracker Encounter Builder",
                () => {
                    this.addBuilderView();
                }
            );
        } else {
            this._builderIcon?.detach();
        }
    }

    /**
     * Update creatures in the active encounter when their statblocks change in Fantasy Statblocks.
     * This preserves combat state (HP, conditions, initiative) while updating statblock properties.
     */
    updateCreaturesFromBestiary() {
        if (!this.canUseStatBlocks) return;
        if (!this.view) return; // No active tracker view

        const creatures = tracker.getOrderedCreatures();
        if (!creatures.length) return;

        let updatedCount = 0;

        for (const creature of creatures) {
            // Skip players - they're managed separately via frontmatter
            if (creature.player) continue;

            // Get the updated statblock from the bestiary
            const updatedStatblock = this.getBaseCreatureFromBestiary(creature.name);
            if (!updatedStatblock) continue;

            // Prepare selective update - only update statblock properties, preserve combat state
            const updates: any = {};

            // Always update images (primary use case)
            if (updatedStatblock.image !== creature.image) {
                updates.image = updatedStatblock.image;
            }
            if ((updatedStatblock as any).image_url !== creature.image_url) {
                updates.image_url = (updatedStatblock as any).image_url;
            }

            // Update base AC only if current AC hasn't been modified
            if (updatedStatblock.ac !== undefined && creature.ac === creature.current_ac) {
                updates.ac = updatedStatblock.ac;
                updates.current_ac = updatedStatblock.ac;
            }

            // Update max HP only if it hasn't been modified in combat
            if (updatedStatblock.hp !== undefined && creature.max === creature.current_max) {
                const newMaxHp = Number(updatedStatblock.hp);
                if (!isNaN(newMaxHp) && newMaxHp !== creature.max) {
                    updates.max = newMaxHp;
                    updates.current_max = newMaxHp;
                    // Adjust current HP if it exceeds new max
                    if (creature.hp > newMaxHp) {
                        updates.hp = newMaxHp;
                    }
                }
            }

            // Update initiative modifier
            const newModifier = "modifier" in updatedStatblock
                ? updatedStatblock.modifier
                : Math.floor(
                      (("stats" in updatedStatblock && updatedStatblock.stats.length > 1
                          ? updatedStatblock.stats[1]
                          : 10) -
                          10) /
                          2
                  );
            if (newModifier !== undefined && newModifier !== creature.modifier) {
                updates.modifier = newModifier;
            }

            // Update other non-combat properties
            if (updatedStatblock.cr !== undefined && updatedStatblock.cr !== creature.cr) {
                updates.cr = updatedStatblock.cr;
            }
            if (updatedStatblock.xp !== undefined && updatedStatblock.xp !== creature.xp) {
                updates.xp = updatedStatblock.xp;
            }
            if (updatedStatblock.hit_dice !== undefined && updatedStatblock.hit_dice !== creature.hit_dice) {
                updates.hit_dice = updatedStatblock.hit_dice;
            }
            if (updatedStatblock["statblock-link"] !== undefined && updatedStatblock["statblock-link"] !== creature["statblock-link"]) {
                updates["statblock-link"] = updatedStatblock["statblock-link"];
            }

            // Apply updates if any were found
            if (Object.keys(updates).length > 0) {
                creature.update(updates);
                updatedCount++;
            }
        }

        // Trigger UI update if any creatures were modified
        if (updatedCount > 0) {
            tracker.updateAndSave();
            console.log(`Initiative Tracker: Updated ${updatedCount} creature(s) from Fantasy Statblocks bestiary`);
        }
    }
}
