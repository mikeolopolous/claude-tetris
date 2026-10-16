'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// ---- Skins: cada una aporta su paleta (índice = tipo de pieza) y su forma de pintar una celda ----

function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

const SKINS = {
  retro: {
    name: 'Retro',
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#64b5f6', '#ffb74d', '#90a4ae', '#ff1744'],
    drawCell(context, px, py, size, color) {
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },
  neon: {
    name: 'Neon',
    glow: true, // el fondo negro y la rejilla se definen en style.css ([data-skin="neon"])
    colors: [null, '#00f0ff', '#fff200', '#ff00ff', '#39ff14', '#ff073a', '#1f51ff', '#ff8c00', '#c0c0ff', '#ff1744'],
    drawCell(context, px, py, size, color) {
      context.save();
      context.shadowColor = color;
      context.shadowBlur = size * 0.5;
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(px + 3, py + 3, size - 6, size - 6);
      context.restore();
      // núcleo tenue para que la pieza se lea como bloque
      context.save();
      context.globalAlpha *= 0.25;
      context.fillStyle = color;
      context.fillRect(px + 4, py + 4, size - 8, size - 8);
      context.restore();
    },
  },
  pastel: {
    name: 'Pastel',
    colors: [null, '#a0e7e5', '#fbe7a1', '#d5b8f0', '#b4f8c8', '#ffaebc', '#a7c7e7', '#ffcba4', '#cfd8dc', '#ff8fa3'],
    drawCell(context, px, py, size, color) {
      const r = size * 0.25;
      roundRectPath(context, px + 2, py + 2, size - 4, size - 4, r);
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = 'rgba(0,0,0,0.12)';
      context.lineWidth = 1;
      context.stroke();
      // brillo suave
      roundRectPath(context, px + 5, py + 4, size - 10, size * 0.25, r * 0.5);
      context.fillStyle = 'rgba(255,255,255,0.45)';
      context.fill();
    },
  },
  pixel: {
    name: 'Pixel art',
    colors: [null, '#3cbcfc', '#f8d878', '#b853f8', '#58d854', '#f83800', '#0058f8', '#fca044', '#a4a4a4', '#e40058'],
    drawCell(context, px, py, size, color) {
      const p = size / 6; // la celda es una rejilla de 6×6 "píxeles"
      context.fillStyle = color;
      context.fillRect(px, py, size, size);
      // borde oscuro abajo/derecha, claro arriba/izquierda (bisel de 8 bits)
      context.fillStyle = 'rgba(0,0,0,0.45)';
      context.fillRect(px, py + size - p, size, p);
      context.fillRect(px + size - p, py, p, size);
      context.fillStyle = 'rgba(255,255,255,0.55)';
      context.fillRect(px, py, size - p, p);
      context.fillRect(px, py, p, size - p);
      // textura de tramado (dithering) en el interior
      context.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 1; i < 5; i++)
        for (let j = 1; j < 5; j++)
          if ((i + j) % 2 === 0) context.fillRect(px + i * p, py + j * p, p, p);
      // brillo de un píxel
      context.fillStyle = '#ffffff';
      context.fillRect(px + p, py + p, p, p);
    },
  },
};

const DEFAULT_SKIN = 'retro';
const SKIN_STORAGE_KEY = 'tetris-skin';

let skin = SKINS[DEFAULT_SKIN];
let COLORS = skin.colors;
let drawCell = skin.drawCell;

const BOMB = 9;
const BOMB_RADIUS = 2; // área 5×5
const BOMB_CHANCE = 0.5; // alta para pruebas; bajar a ~0.05 en producción

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N (tuerca, hueco central)
  [[9]],                                       // B (bomba total)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const RECORDS_KEY = 'tetris-records';
const NAME_KEY = 'tetris-player-name';
const MAX_RECORDS = 5;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const recordMsg = document.getElementById('record-msg');
const nameForm = document.getElementById('name-form');
const playerNameInput = document.getElementById('player-name');
const recordsSection = document.getElementById('records');
const recordsBody = document.getElementById('records-body');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetRecordsBtn = document.getElementById('reset-records');
const themeToggle = document.getElementById('theme-toggle');
const themeToggleLabel = document.getElementById('theme-toggle-label');
const skinSelect = document.getElementById('skin-select');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level');

const START_LEVEL_KEY = 'tetris-start-level';
const MAX_START_LEVEL = 10;
const RESUME_INPUT_LOCK = 200; // ms sin inputs tras reanudar

let gridColor, bombBodyColor;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let startLevel = loadStartLevel(); // nivel elegido para la próxima partida
let gameStartLevel;                // nivel con el que arrancó la partida actual
let inputLockUntil = 0;
let ignoreRepeats = false;         // ignora autorepetición de teclas mantenidas durante la pausa

function loadStartLevel() {
  try {
    const saved = Number(localStorage.getItem(START_LEVEL_KEY));
    if (Number.isInteger(saved) && saved >= 1 && saved <= MAX_START_LEVEL) return saved;
  } catch (_) { /* almacenamiento no disponible */ }
  return 1;
}

function saveStartLevel(value) {
  try { localStorage.setItem(START_LEVEL_KEY, value); } catch (_) { /* sin persistencia */ }
}

function levelInterval(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}
let started = false, combo, maxCombo;

// Récords persistentes y estado de la partida terminada respecto a ellos
let records = loadRecords();
let pendingRank = -1;   // puesto que ocupará la puntuación actual si aún no se ha guardado
let savedRank = -1;     // puesto en el que se acaba de guardar (para resaltarlo)
let newBestCombo = false, newMaxLines = false;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.random() < BOMB_CHANCE
    ? BOMB
    : Math.floor(Math.random() * (BOMB - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function explode(cx, cy) {
  let destroyed = 0;
  for (let r = cy - BOMB_RADIUS; r <= cy + BOMB_RADIUS; r++) {
    if (r < 0 || r >= ROWS) continue;
    for (let c = cx - BOMB_RADIUS; c <= cx + BOMB_RADIUS; c++) {
      if (c < 0 || c >= COLS) continue;
      if (board[r][c]) destroyed++;
      board[r][c] = 0;
    }
  }
  score += destroyed * 10 * level;
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
  } else {
    combo = 0;
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = gameStartLevel + Math.floor(lines / 10);
    dropInterval = levelInterval(level);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.type === BOMB) explode(current.x, current.y);
  else merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  comboEl.textContent = combo;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  if (colorIndex !== BOMB) {
    drawCell(context, x * size, y * size, size, color);
  } else {
    // la bomba se dibuja sin fondo
    const cx = x * size + size / 2;
    const cy = y * size + size / 2 + 2;
    if (skin.glow) {
      context.shadowColor = color;
      context.shadowBlur = size * 0.5;
    }
    // cuerpo
    context.fillStyle = bombBodyColor;
    context.beginPath();
    context.arc(cx, cy, size * 0.28, 0, Math.PI * 2);
    context.fill();
    // mecha
    context.strokeStyle = '#ffd54f';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(cx + size * 0.15, cy - size * 0.22);
    context.lineTo(cx + size * 0.28, cy - size * 0.36);
    context.stroke();
    context.shadowBlur = 0;
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

// ---- Récords (localStorage) ----

function emptyRecords() {
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (data && Array.isArray(data.scores)) {
      return {
        scores: data.scores.slice(0, MAX_RECORDS),
        bestCombo: data.bestCombo || 0,
        maxLines: data.maxLines || 0,
      };
    }
  } catch { /* datos corruptos o storage bloqueado */ }
  return emptyRecords();
}

function saveRecords() {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch { /* storage no disponible */ }
}

function loadPlayerName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}

// Puesto (0-based) que ocuparía `s` en el top, o -1 si no entra
function rankFor(s) {
  if (s <= 0) return -1;
  const idx = records.scores.findIndex(r => s > r.score);
  const rank = idx === -1 ? records.scores.length : idx;
  return rank < MAX_RECORDS ? rank : -1;
}

function commitPendingRecord() {
  if (pendingRank < 0) return;
  const name = playerNameInput.value.trim() || 'Anónimo';
  try { localStorage.setItem(NAME_KEY, name); } catch { /* storage no disponible */ }
  records.scores.splice(pendingRank, 0, { name, score, lines, combo: maxCombo });
  records.scores = records.scores.slice(0, MAX_RECORDS);
  saveRecords();
  savedRank = pendingRank;
  pendingRank = -1;
}

function renderRecords() {
  const rows = records.scores.map((r, i) => ({ ...r, highlight: i === savedRank }));
  if (pendingRank >= 0) {
    rows.splice(pendingRank, 0, {
      name: playerNameInput.value.trim() || 'Tú',
      score, lines, combo: maxCombo, highlight: true,
    });
  }
  recordsBody.replaceChildren();
  if (!rows.length) {
    const tr = recordsBody.insertRow();
    const td = tr.insertCell();
    td.colSpan = 5;
    td.className = 'empty';
    td.textContent = 'Sin récords todavía';
  }
  rows.slice(0, MAX_RECORDS).forEach((r, i) => {
    const tr = recordsBody.insertRow();
    if (r.highlight) tr.className = 'highlight';
    [i + 1, r.name, r.score.toLocaleString(), r.lines, r.combo].forEach(v => {
      tr.insertCell().textContent = v; // textContent: el nombre nunca se interpreta como HTML
    });
  });
  bestComboEl.textContent = records.bestCombo;
  maxLinesEl.textContent = records.maxLines;
  bestComboEl.classList.toggle('is-new', newBestCombo);
  maxLinesEl.classList.toggle('is-new', newMaxLines);
}

function renderGameOverMessage() {
  const msgs = [];
  if (pendingRank >= 0) msgs.push(`¡Entras en el top ${MAX_RECORDS}! Puesto #${pendingRank + 1}`);
  else if (savedRank >= 0) msgs.push(`Guardado en el puesto #${savedRank + 1}`);
  if (newBestCombo) msgs.push('¡Nuevo mejor combo!');
  if (newMaxLines) msgs.push('¡Nuevo récord de líneas!');
  recordMsg.textContent = msgs.join(' · ');
  recordMsg.classList.toggle('hidden', !msgs.length);
  nameForm.classList.toggle('hidden', pendingRank < 0);
}

// mode: 'start' | 'gameover' (la pausa usa su propio menú)
function showOverlay(mode) {
  overlayTitle.classList.toggle('accent', mode === 'start');
  recordsSection.classList.remove('hidden');
  restartBtn.textContent = mode === 'start' ? 'Jugar' : 'Reiniciar';
  if (mode === 'start') {
    overlayTitle.textContent = 'TETRIS';
    overlayScore.textContent = 'Pulsa Enter o «Jugar» para empezar';
  } else {
    overlayTitle.textContent = 'GAME OVER';
    overlayScore.textContent =
      `Puntuación: ${score.toLocaleString()} · Líneas: ${lines} · Combo máx.: ${maxCombo}`;
  }
  if (mode === 'gameover') {
    renderGameOverMessage();
  } else {
    recordMsg.classList.add('hidden');
    nameForm.classList.add('hidden');
  }
  renderRecords();
  overlay.classList.remove('hidden');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  // Mejor combo y líneas máximas no requieren entrar en el top
  newBestCombo = maxCombo > records.bestCombo;
  newMaxLines = lines > records.maxLines;
  if (newBestCombo) records.bestCombo = maxCombo;
  if (newMaxLines) records.maxLines = lines;
  if (newBestCombo || newMaxLines) saveRecords();
  pendingRank = rankFor(score);
  savedRank = -1;
  playerNameInput.value = loadPlayerName();
  showOverlay('gameover');
  if (pendingRank >= 0) {
    playerNameInput.focus();
    playerNameInput.select();
  }
}

function pauseGame() {
  if (!started || gameOver || paused) return;
  paused = true;
  cancelAnimationFrame(animId);
  startLevelSelect.value = startLevel;
  pauseMenu.classList.remove('hidden');
  resumeBtn.focus();
}

function resumeGame() {
  if (!paused) return;
  paused = false;
  pauseMenu.classList.add('hidden');
  // Sin foco en el menú, Espacio/Enter no vuelven a pulsar un botón
  if (document.activeElement) document.activeElement.blur();
  inputLockUntil = performance.now() + RESUME_INPUT_LOCK;
  ignoreRepeats = true;
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function togglePause() {
  if (paused) resumeGame();
  else pauseGame();
}

function setControlsVisible(visible) {
  pauseControls.classList.toggle('hidden', !visible);
  controlsBtn.setAttribute('aria-expanded', visible);
  controlsBtn.textContent = visible ? 'Ocultar controles' : 'Ver controles';
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  gameStartLevel = startLevel;
  level = startLevel;
  paused = false;
  gameOver = false;
  combo = 0;
  maxCombo = 0;
  dropInterval = levelInterval(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  draw();
}

function startGame() {
  // Si se reinicia sin pulsar «Guardar», la puntuación se guarda igualmente
  commitPendingRecord();
  pendingRank = savedRank = -1;
  newBestCombo = newMaxLines = false;
  init();
  started = true;
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  setControlsVisible(false);
  if (document.activeElement) document.activeElement.blur();
  cancelAnimationFrame(animId);
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === playerNameInput) return;
  if (!started) {
    if (e.code === 'Enter' && e.target.tagName !== 'BUTTON') startGame();
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (!e.repeat && !gameOver) togglePause();
    return;
  }
  if (paused) {
    // El menú abierto bloquea el juego; Espacio solo actúa sobre botones/select
    const onControl = e.target instanceof HTMLButtonElement || e.target instanceof HTMLSelectElement;
    if (e.code === 'Space' && !onControl) e.preventDefault();
    return;
  }
  if (gameOver) return;
  if (e.code === 'Space') e.preventDefault();
  if (performance.now() < inputLockUntil || (ignoreRepeats && e.repeat)) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => {
  restartBtn.blur(); // evita que Espacio vuelva a pulsar el botón durante la partida
  startGame();
});

document.addEventListener('keyup', () => { ignoreRepeats = false; });

resumeBtn.addEventListener('click', resumeGame);
pauseRestartBtn.addEventListener('click', startGame);
controlsBtn.addEventListener('click', () => {
  setControlsVisible(pauseControls.classList.contains('hidden'));
});
startLevelSelect.addEventListener('change', () => {
  startLevel = Number(startLevelSelect.value);
  saveStartLevel(startLevel);
});

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  commitPendingRecord();
  playerNameInput.blur();
  showOverlay('gameover');
});

playerNameInput.addEventListener('input', renderRecords);

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los récords?')) return;
  records = emptyRecords();
  saveRecords();
  newBestCombo = newMaxLines = false;
  savedRank = -1;
  if (gameOver) {
    pendingRank = rankFor(score);
    showOverlay('gameover');
  } else {
    renderRecords();
  }
  resetRecordsBtn.blur();
});

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute('aria-checked', isLight);
  themeToggleLabel.textContent = isLight ? 'Modo oscuro' : 'Modo claro';
  readThemeColors();
  // En pausa o game over el loop no redibuja
  draw();
  drawNext();
}

themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  themeToggle.blur(); // evita que Espacio active el switch en vez de la caída
});

function readThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  gridColor = styles.getPropertyValue('--grid').trim();
  bombBodyColor = styles.getPropertyValue('--bomb-body').trim();
}

function loadSkin() {
  try {
    const saved = localStorage.getItem(SKIN_STORAGE_KEY);
    if (saved && SKINS[saved]) return saved;
  } catch (e) { /* localStorage no disponible */ }
  return DEFAULT_SKIN;
}

function applySkin(id, redraw = true) {
  skin = SKINS[id] || SKINS[DEFAULT_SKIN];
  COLORS = skin.colors;
  drawCell = skin.drawCell;
  document.documentElement.dataset.skin = id;
  skinSelect.value = id;
  try { localStorage.setItem(SKIN_STORAGE_KEY, id); } catch (e) { /* ignorar */ }
  readThemeColors();
  if (redraw) {
    // En pausa o game over el loop no redibuja
    draw();
    drawNext();
  }
}

for (const [id, s] of Object.entries(SKINS)) {
  const opt = document.createElement('option');
  opt.value = id;
  opt.textContent = s.name;
  skinSelect.appendChild(opt);
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  skinSelect.blur(); // evita que las flechas cambien de skin en vez de mover la pieza
});

applySkin(loadSkin(), false);
init();
showOverlay('start');
