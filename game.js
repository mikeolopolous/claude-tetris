'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
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

let gridColor, bombBodyColor;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
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
    context.fillStyle = color;
    context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    // highlight
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  } else {
    // la bomba se dibuja sin fondo
    const cx = x * size + size / 2;
    const cy = y * size + size / 2 + 2;
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

// mode: 'start' | 'pause' | 'gameover'
function showOverlay(mode) {
  overlayTitle.classList.toggle('accent', mode === 'start');
  recordsSection.classList.toggle('hidden', mode === 'pause');
  restartBtn.textContent = mode === 'start' ? 'Jugar' : 'Reiniciar';
  if (mode === 'start') {
    overlayTitle.textContent = 'TETRIS';
    overlayScore.textContent = 'Pulsa Enter o «Jugar» para empezar';
  } else if (mode === 'pause') {
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
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
  if (mode !== 'pause') renderRecords();
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

function togglePause() {
  if (gameOver || !started) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showOverlay('pause');
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
  level = 1;
  paused = false;
  gameOver = false;
  combo = 0;
  maxCombo = 0;
  dropInterval = 1000;
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
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
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

restartBtn.addEventListener('click', () => {
  restartBtn.blur(); // evita que Espacio vuelva a pulsar el botón durante la partida
  startGame();
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

readThemeColors();
init();
showOverlay('start');
