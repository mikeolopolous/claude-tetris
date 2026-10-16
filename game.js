'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const RETRO_COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - light blue
  '#ffb74d', // L - orange
  '#90a4ae', // N - tuerca (gris acero)
  '#ff1744', // B - bomba total (rojo intenso)
];

// Paleta activa: la reasigna applySkin()
let COLORS = RETRO_COLORS;

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

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const themeToggleLabel = document.getElementById('theme-toggle-label');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsToggle = document.getElementById('controls-toggle');
const controlsPanel = document.getElementById('controls-panel');
const startLevelSelect = document.getElementById('start-level');

let gridColor, bombBodyColor;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let started = false, combo = 0, maxCombo = 0;

// ---- Menú de pausa: estado ----
const START_LEVEL_KEY = 'tetris.startLevel';
const RESUME_IGNORE_MS = 150;
let startLevel = loadStartLevel(); // se aplica a la siguiente partida
let baseLevel = 1;                 // nivel inicial de la partida en curso
let ignoreInputUntil = 0;
const staleKeys = new Set();       // teclas pulsadas con el menú abierto

function loadStartLevel() {
  try {
    const v = parseInt(localStorage.getItem(START_LEVEL_KEY), 10);
    if (v >= 1 && v <= 10) return v;
  } catch (_) { /* storage no disponible */ }
  return 1;
}

function saveStartLevel(v) {
  try { localStorage.setItem(START_LEVEL_KEY, String(v)); } catch (_) { /* ignorar */ }
}

function computeDropInterval(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

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
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = baseLevel + Math.floor(lines / 10);
    dropInterval = computeDropInterval(level);
    updateHUD();
  }
  return cleared;
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
  updateCombo(clearLines());
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
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  if (colorIndex !== BOMB) {
    activeSkin.drawCell(context, x * size, y * size, size, color);
  } else {
    // la bomba se dibuja sin fondo
    const cx = x * size + size / 2;
    const cy = y * size + size / 2 + 2;
    context.save();
    if (activeSkin.glow) {
      context.shadowColor = color;
      context.shadowBlur = 12;
    }
    // cuerpo
    context.fillStyle = activeSkin.bombBody || bombBodyColor;
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
    context.restore();
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = activeSkin.gridColor || gridColor;
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
  if (!current) return; // pantalla de inicio: solo la rejilla

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
  if (!next) return;
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  showPauseMenu(false);
  overlay.classList.remove('hidden');
  showGameOverRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    showPauseMenu(false);
    afterMenuClose();
    lastTime = performance.now();
    cancelAnimationFrame(animId);
    animId = requestAnimationFrame(loop);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    showPauseMenu(true);
    overlay.classList.remove('hidden');
    resumeBtn.focus();
  }
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
  baseLevel = startLevel;
  level = baseLevel;
  paused = false;
  gameOver = false;
  dropInterval = computeDropInterval(level);
  dropAccum = 0;
  combo = 0;
  maxCombo = 0;
  started = true;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  showPauseMenu(false);
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // antes de empezar o escribiendo el nombre no se procesan teclas de juego
  if (!started || e.target instanceof HTMLInputElement) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (!e.repeat) togglePause();
    return;
  }
  if (paused) {
    // el menú se navega con Tab/Enter/Espacio; las teclas quedan "viejas" hasta soltarse
    staleKeys.add(e.code);
    if (e.repeat) e.preventDefault();
    return;
  }
  if (gameOver) return;
  if (staleKeys.has(e.code) || performance.now() < ignoreInputUntil) {
    if (e.code === 'Space') e.preventDefault();
    return;
  }
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
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

// ---- Tabla de records (localStorage) ----
const RECORDS_KEY = 'tetris.records';
const MAX_RECORDS = 5;
const NAME_MAX = 12;

const startBtn = document.getElementById('start-btn');
const recordsEl = document.getElementById('records');
const recordsBody = document.getElementById('records-body');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const newRecordMsg = document.getElementById('new-record-msg');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const resetRecordsBtn = document.getElementById('reset-records-btn');

let records = loadRecords();
// estado del récord de la partida terminada: 'none' | 'pending' | 'saved'
let recordState = 'none';
let storageOk = true; // si falla la escritura, la copia en memoria manda

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function toCount(v) {
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function isValidEntry(r) {
  return r && typeof r === 'object'
    && typeof r.name === 'string'
    && Number.isFinite(r.score) && r.score >= 0
    && Number.isFinite(r.lines) && r.lines >= 0
    && Number.isFinite(r.level) && r.level >= 1
    && typeof r.date === 'string';
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return emptyRecords();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return emptyRecords();
    const top = Array.isArray(data.top) ? data.top.filter(isValidEntry) : [];
    return {
      top: top
        .map(r => ({ name: r.name.slice(0, NAME_MAX), score: r.score, lines: r.lines, level: r.level, date: r.date }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RECORDS),
      bestCombo: toCount(data.bestCombo),
      maxLines: toCount(data.maxLines),
    };
  } catch {
    return emptyRecords();
  }
}

function saveRecords() {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    storageOk = true;
  } catch {
    storageOk = false;
    // sin almacenamiento disponible: los récords solo viven en memoria
  }
}

// combo = bloqueos consecutivos que limpian al menos una línea
function updateCombo(cleared) {
  combo = cleared > 0 ? combo + 1 : 0;
  if (combo > maxCombo) maxCombo = combo;
}

function qualifies(s) {
  return s > 0 && (records.top.length < MAX_RECORDS || s > records.top[records.top.length - 1].score);
}

function formatDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('es');
}

function renderRecords(highlight) {
  recordsBody.replaceChildren();
  if (!records.top.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'records-empty';
    td.textContent = 'Sin récords todavía';
    tr.appendChild(td);
    recordsBody.appendChild(tr);
  }
  records.top.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (i === highlight) tr.className = 'highlight';
    for (const text of [i + 1, r.name, r.score.toLocaleString(), r.lines, r.level, formatDate(r.date)]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    recordsBody.appendChild(tr);
  });
  bestComboEl.textContent = records.bestCombo;
  maxLinesEl.textContent = records.maxLines;
}

function showNameForm(show) {
  nameForm.classList.toggle('is-hidden', !show);
  if (show) {
    nameInput.value = 'Jugador';
    nameInput.focus();
    nameInput.select();
  }
}

function showStartScreen() {
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = 'Pulsa Jugar para empezar';
  restartBtn.classList.add('is-hidden');
  startBtn.classList.remove('is-hidden');
  newRecordMsg.classList.add('is-hidden');
  showNameForm(false);
  renderRecords(-1);
  recordsEl.classList.remove('is-hidden');
  overlay.classList.remove('hidden');
}

function showGameOverRecords() {
  if (storageOk) records = loadRecords(); // relee por si otra pestaña guardó algo
  records.bestCombo = Math.max(records.bestCombo, maxCombo);
  records.maxLines = Math.max(records.maxLines, lines);
  saveRecords();
  recordState = qualifies(score) ? 'pending' : 'none';
  newRecordMsg.classList.add('is-hidden');
  renderRecords(-1);
  recordsEl.classList.remove('is-hidden');
  showNameForm(recordState === 'pending');
}

function hideRecords() {
  recordState = 'none';
  showNameForm(false);
  newRecordMsg.classList.add('is-hidden');
  recordsEl.classList.add('is-hidden');
}

function saveCurrentRecord() {
  if (recordState !== 'pending') return -1;
  recordState = 'saved';
  if (storageOk) records = loadRecords();
  const name = nameInput.value.trim().slice(0, NAME_MAX) || 'Jugador';
  const entry = { name, score, lines, level, date: new Date().toISOString() };
  // a igual puntuación, el récord nuevo queda detrás de los existentes
  let idx = records.top.findIndex(r => score > r.score);
  if (idx === -1) idx = records.top.length;
  records.top.splice(idx, 0, entry);
  records.top = records.top.slice(0, MAX_RECORDS);
  saveRecords();
  return idx < MAX_RECORDS ? idx : -1;
}

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  if (recordState !== 'pending') return;
  const idx = saveCurrentRecord();
  nameInput.blur();
  showNameForm(false);
  renderRecords(idx);
  newRecordMsg.classList.toggle('is-hidden', idx < 0);
});

// si se mantenía pulsada una tecla al perder, la autorrepetición no debe escribir en el nombre
nameInput.addEventListener('keydown', e => {
  if (e.repeat) e.preventDefault();
});

resetRecordsBtn.addEventListener('click', () => {
  resetRecordsBtn.blur();
  if (!confirm('¿Seguro que quieres borrar todos los récords? Esta acción no se puede deshacer.')) return;
  records = emptyRecords();
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch {
    // ignorar: el estado en memoria ya está vacío
  }
  newRecordMsg.classList.add('is-hidden');
  renderRecords(-1);
  // si la partida terminada no se guardó aún, ahora puede entrar en la tabla
  if (gameOver && recordState === 'none') {
    recordState = qualifies(score) ? 'pending' : 'none';
    showNameForm(recordState === 'pending');
  }
});

startBtn.addEventListener('click', () => {
  startBtn.blur();
  startBtn.classList.add('is-hidden');
  restartBtn.classList.remove('is-hidden');
  hideRecords();
  init();
});

restartBtn.addEventListener('click', restartGame);

// ---- Menú de pausa ----
function showPauseMenu(show) {
  pauseMenu.classList.toggle('hidden', !show);
  restartBtn.classList.toggle('hidden', show);
  if (!show) setControlsOpen(false);
}

function setControlsOpen(open) {
  controlsPanel.hidden = !open;
  controlsToggle.setAttribute('aria-expanded', open);
}

// tras cerrar el menú: quitar foco y descartar teclas ya pulsadas
function afterMenuClose() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  ignoreInputUntil = performance.now() + RESUME_IGNORE_MS;
}

function restartGame() {
  // reiniciar sin pulsar Guardar no pierde el récord: se guarda con el nombre escrito
  if (gameOver) saveCurrentRecord();
  hideRecords();
  init();
  afterMenuClose();
}

document.addEventListener('keyup', e => staleKeys.delete(e.code));
window.addEventListener('blur', () => staleKeys.clear());

resumeBtn.addEventListener('click', () => { if (paused) togglePause(); });
pauseRestartBtn.addEventListener('click', restartGame);
controlsToggle.addEventListener('click', () => setControlsOpen(controlsPanel.hidden));

for (let i = 1; i <= 10; i++) startLevelSelect.add(new Option(String(i), String(i)));
startLevelSelect.value = String(startLevel);
startLevelSelect.addEventListener('change', () => {
  startLevel = parseInt(startLevelSelect.value, 10);
  saveStartLevel(startLevel);
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

// ---- Skins (temas visuales de las piezas) ----
const skinSelect = document.getElementById('skin-select');
const SKIN_KEY = 'tetris.skin';

// Clásico: cuadro plano + brillo superior
function drawRetroCell(c, px, py, size, color) {
  c.fillStyle = color;
  c.fillRect(px + 1, py + 1, size - 2, size - 2);
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.fillRect(px + 1, py + 1, size - 2, 4);
}

// Neón: resplandor con el color de la pieza (save/restore para no contagiar el shadow)
function drawNeonCell(c, px, py, size, color) {
  c.save();
  c.shadowColor = color;
  c.shadowBlur = 12;
  c.fillStyle = color;
  c.fillRect(px + 3, py + 3, size - 6, size - 6);
  c.restore();
  c.strokeStyle = color;
  c.lineWidth = 1.5;
  c.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(px + 6, py + 6, size - 12, size - 12);
}

function roundedRectPath(c, x, y, w, h, r) {
  c.beginPath();
  if (typeof c.roundRect === 'function') {
    c.roundRect(x, y, w, h, r);
  } else {
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
}

// Pastel: bloques con esquinas redondeadas y brillo suave
function drawPastelCell(c, px, py, size, color) {
  const r = size * 0.25;
  roundedRectPath(c, px + 2, py + 2, size - 4, size - 4, r);
  c.fillStyle = color;
  c.fill();
  roundedRectPath(c, px + 5, py + 4, size - 10, size * 0.3, r * 0.6);
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fill();
}

// Pixel art: bloque base + bisel + textura de píxeles claros/oscuros
function drawPixelCell(c, px, py, size, color) {
  const p = Math.max(2, Math.round(size / 10));
  c.fillStyle = color;
  c.fillRect(px, py, size, size);
  // bisel
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.fillRect(px, py, size, p);
  c.fillRect(px, py, p, size);
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(px, py + size - p, size, p);
  c.fillRect(px + size - p, py, p, size);
  // textura
  c.fillStyle = 'rgba(255,255,255,0.3)';
  c.fillRect(px + p * 2, py + p * 2, p, p);
  c.fillRect(px + p * 3, py + p * 2, p, p);
  c.fillRect(px + p * 2, py + p * 3, p, p);
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.fillRect(px + p * 6, py + p * 6, p, p);
  c.fillRect(px + p * 5, py + p * 7, p, p);
  c.fillRect(px + p * 7, py + p * 4, p, p);
}

const SKINS = {
  retro: { colors: RETRO_COLORS, drawCell: drawRetroCell },
  neon: {
    colors: [null, '#00f0ff', '#fff200', '#d400ff', '#39ff14', '#ff073a', '#2d6bff', '#ff9900', '#c0c0ff', '#ff1744'],
    canvasBg: '#000000',
    gridColor: '#101018',
    bombBody: '#ffffff',
    glow: true,
    drawCell: drawNeonCell,
  },
  pastel: {
    colors: [null, '#a8e6ef', '#fff1a8', '#d7b8f3', '#b9f0c4', '#f7b2bd', '#aecbfa', '#ffd3a8', '#c9d1d9', '#ff8a9a'],
    drawCell: drawPastelCell,
  },
  pixel: {
    colors: [null, '#29adff', '#ffec27', '#a05ae0', '#00e436', '#ff004d', '#1d5fd8', '#ffa300', '#83769c', '#ff004d'],
    drawCell: drawPixelCell,
  },
};

let activeSkin = SKINS.retro;

function loadSkin() {
  try {
    const saved = localStorage.getItem(SKIN_KEY);
    if (saved && Object.hasOwn(SKINS, saved)) return saved;
  } catch (_) { /* localStorage no disponible */ }
  return 'retro';
}

function applySkin(name) {
  if (!Object.hasOwn(SKINS, name)) name = 'retro';
  activeSkin = SKINS[name];
  COLORS = activeSkin.colors;
  skinSelect.value = name;
  // Estilo inline: si la skin no define fondo, vuelve a --canvas-bg del tema
  const bg = activeSkin.canvasBg || '';
  canvas.style.background = bg;
  nextCanvas.style.background = bg;
  try { localStorage.setItem(SKIN_KEY, name); } catch (_) { /* ignorar */ }
  // En pausa o game over el loop no redibuja
  if (current) {
    draw();
    drawNext();
  }
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  skinSelect.blur(); // devuelve las flechas y Espacio al juego
});

applySkin(loadSkin());

readThemeColors();
draw();
showStartScreen();
