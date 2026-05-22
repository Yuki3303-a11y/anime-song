# Testing

## Current State
**No formal testing** — no unit tests, integration tests, test framework, or CI pipeline. Testing is entirely manual.

## Manual Test Checklist
- [ ] Main menu loads with sakura particles
- [ ] Single player: start → audio plays → options display → answer feedback → detail modal → next → end
- [ ] PK multiplayer: create room → share → join → start → scores sync → end
- [ ] Settings modal: year chips (multi-select), type chips, source filter, question count
- [ ] Bangumi import: input index ID → import → songs appear → filter by source
- [ ] Custom songs: JSON import/export, individual delete, clear all
- [ ] Keyboard: 1-4 answer select, Space play/pause, Escape close modals (skip when focus in INPUT/TEXTAREA)
- [ ] Audio: play/pause, visualizer, progress bar, volume slider
- [ ] Leaderboard: records display, clear

## Known Issues
1. **Input text invisible in container** — inputs inside `.container` (overflow:hidden + border-radius) have invisible text in Chrome/Edge. Workaround: use `position:fixed` outside `.container`.
2. **iTunes preview unavailable** — some songs silently skipped when all 3 search strategies fail
3. **Bangumi HTML parsing fragile** — regex-based parsing may break if Bangumi changes markup
4. **No loading states** — most transitions lack visual feedback
5. **CORS proxy dependency** — `cors-anywhere.fly.dev` may be unreliable long-term

## Debug Pages
`debug2.html` through `debug13.html` in project root — created to isolate the input text rendering bug. `debug13.html` loads `app_minimal.js` for testing specific app.js components.
