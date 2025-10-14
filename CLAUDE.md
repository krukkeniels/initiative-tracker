# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Initiative Tracker is an Obsidian plugin for tracking initiative and turn order during TTRPG combat encounters. It integrates with the Fantasy Statblocks plugin and Dice Roller plugin to provide a complete combat management system.

## Build and Development Commands

### Building
```bash
npm run build          # Production build (outputs to ./)
npm run dev            # Development build with watch mode (uses OUTDIR env var)
```

The build uses esbuild with Svelte support. Production builds minify code and exclude sourcemaps; dev builds include inline sourcemaps.

### TypeScript
The build command automatically generates TypeScript declarations:
```bash
# This runs as part of `npm run build`
tsc --project tsconfig.json --emitDeclarationOnly --declaration --declarationMap --outdir ./dist
```

### Development Setup
For development, set the `OUTDIR` environment variable (in `.env` file) to your Obsidian vault's plugin directory to hot-reload changes during development.

## Architecture

### Plugin Structure

**Main Plugin Class** (`src/main.ts`): `InitiativeTracker` extends Obsidian's `Plugin` class and serves as the central coordinator. It manages:
- Plugin lifecycle (load/unload)
- Settings and data persistence
- Integration with Fantasy Statblocks and Dice Roller plugins
- Multiple view types registration
- Player creature management
- Command registration for saved encounters

**Data Flow**: The plugin uses Svelte stores for reactive state management. The main tracker store (`src/tracker/stores/tracker.ts`) manages all combat state including creatures, initiative order, round tracking, and HP/status updates.

### Core Components

**Views** (Obsidian workspace leaves):
- `TrackerView` (`INITIATIVE_TRACKER_VIEW`): Main combat tracker UI in the right sidebar
- `BuilderView` (`BUILDER_VIEW`): Encounter builder for planning encounters with difficulty calculations
- `CreatureView` (`CREATURE_TRACKER_VIEW`): Individual creature statblock viewer
- `PlayerView` (`PLAYER_VIEW_VIEW`): Player-facing view for displaying initiative

**Encounter System** (`src/encounter/index.ts`):
- `EncounterParser`: Parses YAML encounter definitions from code blocks
- `EncounterBlock`: Markdown code block processor for `encounter` and `encounter-table` blocks
- Supports inline encounter syntax: `` `encounter: 3: Goblin` ``

**Creature Management** (`src/utils/creature.ts`):
- `Creature` class: Core model representing combatants (players and NPCs)
- Tracks HP, AC, initiative, conditions, and other combat stats
- Supports serialization to/from JSON for persistence

**Tracker Store** (`src/tracker/stores/tracker.ts`):
- Svelte writable store managing all creatures in combat
- Handles initiative ordering (respects `descending` setting and `resolveTies` modes)
- Manual ordering via drag-and-drop (stored in `creature.manualOrder` property)
- Manages combat state (active, round, HP updates, conditions)
- Implements HP overflow handling, temp HP, and automatic status application
- Provides condensed mode for grouping identical creatures

### RPG System Support

The plugin supports multiple RPG systems through an extensible system (`src/utils/rpg-system/`):
- `RpgSystem` base class defines the interface
- Implementations: `dnd5e`, `pf2e`, `dnd5e-lazygm`, `dnd5e-cr2-simple`, `dnd5e-flee-mortals`
- Systems calculate encounter difficulty, XP values, and difficulty thresholds

### Integration Points

**Fantasy Statblocks Plugin**:
- Checks availability: `plugin.canUseStatBlocks` (requires v4+)
- Accesses bestiary: `window.FantasyStatblocks.getBestiaryCreatures()`
- Waits for bestiary load: `window.FantasyStatblocks.onResolved(callback)`
- Must handle async bestiary loading in UI components

**Dice Roller Plugin**:
- Checks availability: `plugin.canUseDiceRoller`
- Gets roller: `window.DiceRoller.getRoller(diceString, source)`
- Used for initiative rolls, HP rolling, and creature quantity dice

### Settings and Data

**Settings** (`src/settings/settings.types.ts`):
- `InitiativeTrackerData`: Main settings interface
- Includes combat preferences, status conditions, parties, saved encounters
- Persisted via `plugin.saveSettings()`

**Players vs NPCs**:
- Players are stored in `plugin.data.players` and managed via `plugin.playerCreatures` Map
- Players can be organized into parties (`plugin.data.parties`)
- NPCs come from Fantasy Statblocks bestiary or are created ad-hoc

## Key Implementation Details

### Initiative Ordering and Tie Resolution

The tracker sorts creatures by:
1. Initiative value (descending or ascending based on settings)
2. Manual order (from drag-and-drop, stored in `creature.manualOrder`)
3. Tie resolution setting (`resolveTies`): random, player-first, or npc-first

See `src/tracker/stores/tracker.ts` lines 118-158 for the sorting implementation.

### Encounter Syntax

Code blocks use YAML:
```yaml
name: Example Encounter
party: Main Party          # or players: [Alice, Bob]
creatures:
  - 3: Goblin             # Number: CreatureName
  - Ogre                  # Single creature
  - [Hobgoblin, Jim]      # Creature with display name
  - Orc, 10, 15, 2, 100   # Name, HP, AC, Init Modifier, XP
  - Kobold, hidden        # Hidden from players
  - Kobold, friendly      # Allied creature
```

Inline syntax: `` `encounter: 3: Goblin, 2: Orc` ``

### HP and Damage Handling

- Damage reduces temp HP first, then actual HP
- HP can be clamped at 0 (settings: `clamp`)
- Overflow healing handling (settings: `hpOverflow`): ignore, convert to temp HP, or allow overflow
- Max HP damage supported (prefix with 'm' in damage input)
- Auto-applies unconscious status when HP <= 0 (if `autoStatus` enabled)

### Logging System

The plugin includes a combat logger (`src/logger/logger.ts`) that records:
- Combat start/stop
- Creature additions/removals
- HP changes, conditions, initiative changes
- Round progression and turn order

Logs are saved as markdown files to the configured log folder.

### Editor Integration

- CodeMirror editor with custom theme (`src/utils/editor/`)
- Encounter suggester for autocompleting creature names in YAML blocks (`src/encounter/editor-suggestor/`)

## Common Development Tasks

### Adding a New RPG System

1. Create new file in `src/utils/rpg-system/` extending `RpgSystem`
2. Implement required methods: `getCreatureDifficulty`, `getEncounterDifficulty`, `getDifficultyThresholds`
3. Add to `src/utils/rpg-system/index.ts` exports
4. Register in settings UI

### Modifying Creature Behavior

The `Creature` class is in `src/utils/creature.ts`. Key methods:
- `update(changes)`: Apply stat changes
- `addCondition(condition)`: Add status effect
- `toJSON()`/`fromJSON()`: Serialization
- Integration points exist in `src/tracker/stores/tracker.ts` for all creature updates

### Working with the Tracker Store

The tracker is a Svelte store, so:
- Subscribe: `tracker.subscribe(callback)`
- Update creatures: `tracker.updateCreatures({ creature, change })`
- Access ordered list: `tracker.getOrderedCreatures()`
- State changes automatically save via `updateAndSave()` helper

## Important Constraints

- Must maintain compatibility with Obsidian API (externals in esbuild.config.mjs)
- Fantasy Statblocks v4+ required for bestiary integration
- Svelte components use injected CSS (configured in esbuild)
- TypeScript strict null checks disabled (`strictNullChecks: false`)
- All views must handle async bestiary loading when Fantasy Statblocks is enabled
