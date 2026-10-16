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
- **Loop**: `requestAnimationFrame`-based `loop(ts)` accumulates `dropAccum` and drops one row per `dropInterval` ms, then redraws everything with `draw()` each frame. Pause/game over stop it via `cancelAnimationFrame(animId)`; `init()` fully resets state and is also the restart handler.
- **Scoring**: `LINE_SCORES[cleared] * level`; hard drop +2/cell, soft drop +1/row. Level = `floor(lines/10)+1`; `dropInterval = max(100, 1000 - (level-1)*90)`.
- **HTML coupling**: `game.js` looks up DOM ids `board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`. The overlay is shared by PAUSA and GAME OVER, toggled via the `hidden` class.
- **Start screen & records**: on load the game does NOT start — `showStartScreen()` shows the overlay with the records table and `#start-btn` (Jugar), which calls `init()`. `started` stays `false` until `init()`, so the keydown handler ignores game keys before that (and while typing in an `<input>`); `draw()`/`drawNext()` return early while `current`/`next` are undefined. Records live in `localStorage` key `tetris.records` = `{ top: [{name, score, lines, level, date}], bestCombo, maxLines }`, read via `loadRecords()` (validates, falls back to empty on any error) and written via `saveRecords()` (try/catch; the game works without storage). `combo`/`maxCombo` count consecutive locks that clear ≥1 line (`updateCombo(clearLines())` in `lockPiece`; doesn't affect scoring). `endGame()` → `showGameOverRecords()` updates `bestCombo`/`maxLines` and shows `#name-form` if the score qualifies for the top 5. Extra DOM ids: `records`, `records-body`, `best-combo`, `max-lines`, `new-record-msg`, `name-form`, `name-input`, `save-btn`, `reset-records-btn`, `start-btn`; inner elements are hidden with the `is-hidden` class. Player names are rendered only with `textContent`.

## Gotchas

- Changing `COLS`, `ROWS`, or `BLOCK` requires updating the `<canvas id="board">` `width`/`height` in `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`). The next-piece preview assumes a 4×4 grid of 30px cells on a 120×120 canvas.
- `endGame()` called from inside `loop` cancels the already-running frame (a no-op), so `loop` itself must check `gameOver` before re-scheduling. Resuming from pause also doesn't re-hide the overlay. Be aware of these when touching pause/game-over flow.
