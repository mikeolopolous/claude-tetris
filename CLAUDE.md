# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Classic Tetris in vanilla JavaScript + HTML5 Canvas + CSS. No dependencies, no `package.json`, no build step, no tests, no linter. UI text and the README are in Spanish; keep user-facing strings in Spanish.

## Running

Open `index.html` directly, or serve the folder statically (preferred):

    python3 -m http.server 8000   # then http://localhost:8000

There is no automated test suite — verify changes by playing in the browser.

## Architecture

All logic lives in `game.js` (single script, `'use strict'`, no modules, all state in module-level `let` globals: `board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId`).

- **Board**: `ROWS × COLS` matrix; `0` = empty, `1–8` = piece type (8 = the "tuerca", a 3×3 ring with an empty center), which doubles as the index into `COLORS` and the cell values inside `PIECES` shapes. Index 0 of `COLORS`/`PIECES` is `null` on purpose.
- **Pieces**: square matrices; rotation is `rotateCW` (transpose + reverse) with simple wall kicks in `tryRotate` (offsets `0, -1, 1, -2, 2`), not SRS.
- **Piece lifecycle**: `collide` guards every move → `lockPiece` = `merge` → `clearLines` (updates score/level/`dropInterval`) → `spawn` (promotes `next`, game over if the new piece collides).
- **Loop**: `requestAnimationFrame`-based `loop(ts)` accumulates `dropAccum` and drops one row per `dropInterval` ms, then redraws everything with `draw()` each frame. Pause/game over stop it via `cancelAnimationFrame(animId)`; `init()` fully resets state (hiding both overlays) and is also the restart handler.
- **Pause menu**: `P`/`Escape` → `togglePause()` → `pauseGame()` / `resumeGame()`. While `paused`, the keydown handler ignores all game keys. `resumeGame()` blurs the focused menu control, sets `inputLockUntil` (`RESUME_INPUT_LOCK` ms with no game input) and `ignoreRepeats` (drops auto-repeat keydowns until the next `keyup`) so held keys don't move the piece on return.
- **Scoring**: `LINE_SCORES[cleared] * level`; hard drop +2/cell, soft drop +1/row. Level = `gameStartLevel + floor(lines/10)`; `dropInterval = levelInterval(level)` = `max(100, 1000 - (level-1)*90)`. `startLevel` (pause-menu selector, persisted in `localStorage` key `tetris-start-level`) is copied into `gameStartLevel` by `init()`, so changing it only affects the next game.
- **HTML coupling**: `game.js` looks up DOM ids `board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`. `#overlay` is GAME OVER only; the pause menu is a separate overlay with ids `pause-menu`, `resume-btn`, `pause-restart-btn`, `controls-btn`, `pause-controls`, `start-level`. Both are toggled via the `hidden` class.

## Gotchas

- Changing `COLS`, `ROWS`, or `BLOCK` requires updating the `<canvas id="board">` `width`/`height` in `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`). The next-piece preview assumes a 4×4 grid of 30px cells on a 120×120 canvas.
- `endGame()` called from inside `loop` cancels the already-running frame (a no-op), so `loop` itself must check `gameOver` before re-scheduling. Be aware of this when touching pause/game-over flow.
