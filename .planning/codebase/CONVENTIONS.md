# Conventions

## Naming
- **JS functions:** camelCase (`startSingle`, `loadQuestion`, `fetchAnimeDetail`, `getFilteredSongs`)
- **CSS classes:** kebab-case (`settings-modal`, `play-btn`, `custom-import-row`)
- **DOM IDs:** camelCase (`statusDot`, `audioEl`, `songCount`, `roomIdInput`)
- **Event handler attributes:** `data-action="actionName"` with optional `data-value="param"`
- **View components:** `id="v-{viewName}"` (e.g., `v-menu`, `v-game`, `v-lobby`)

## Code Organization
- **app.js section dividers:** ASCII art comment blocks:
  ```
  // =====================================================================
  // Section Title
  // =====================================================================
  ```
- **Import pattern:** ES modules from CDN (Firebase SDK v11.6.1) and local `./songs.js`. No bundler, no npm.
- **Function ordering:** State first, then utilities, then features, then event wiring, then init at bottom.
- **Global shortcuts:** `const $ = id => document.getElementById(id);` for concise DOM access.
- **State management:** Central `gameState` object (mutable). `filterState` object. Direct DOM mutation.

## CSS Patterns
- **Custom properties:** All in `:root` — colors (`--pink`, `--purple`), gradients (`--accent-gradient`), surfaces (`--bg-page`, `--bg-card`), shadows (`--shadow-sm/md/lg`), radii (`--radius-sm/md/lg/xl/full`), motion (`--ease`)
- **Z-index scale:** 0 (sakura canvas), 1 (app), 10 (sparkles), 100 (end modal), 150 (emojis), 200 (detail modal), 300 (settings modal), 400 (notification), 9999 (floating FAB)
- **Animation naming:** descriptive camelCase (`fadeUp`, `comboIn`, `correctPop`)
- **Responsive breakpoints:** `480px` (mobile) and `360px` (small screens)
- **Gradient text:** `-webkit-background-clip: text` with transparent fill
- **Modal pattern:** backdrop blur overlay + slide-up/slide-in panel

## Error Handling
- **API calls:** Every fetch uses `AbortController` with timeout
- **Fallback chains:** Audio search (3-step), Bangumi import (3-step), Anime detail (5-step)
- **Cache-first:** `MemCache` class wrapping localStorage with LRU eviction
- **Auth guard:** All multiplayer ops check `if (!user)` before proceeding

## Git Commit Style
Conventional commit prefixes: `fix:`, `feat:`, `chore:`, `debug:`. Descriptions in Chinese, single sentence.
