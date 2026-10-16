# Tetris

Implementación del clásico **Tetris** en JavaScript vanilla, usando HTML5 Canvas y CSS. Sin dependencias externas, sin frameworks, sin proceso de build: solo abrir y jugar.

![Tech](https://img.shields.io/badge/HTML5-Canvas-orange)
![Tech](https://img.shields.io/badge/CSS3-blueviolet)
![Tech](https://img.shields.io/badge/JavaScript-Vanilla-yellow)

---

## Tabla de contenidos

- [Tetris](#tetris)
  - [Tabla de contenidos](#tabla-de-contenidos)
  - [Qué hace el proyecto](#qué-hace-el-proyecto)
  - [Cómo ejecutar el juego](#cómo-ejecutar-el-juego)
    - [Opción 1: abrir el archivo directamente](#opción-1-abrir-el-archivo-directamente)
    - [Opción 2: servidor local (recomendado)](#opción-2-servidor-local-recomendado)
  - [Controles](#controles)
  - [Cómo funciona](#cómo-funciona)
    - [1. `index.html`](#1-indexhtml)
    - [2. `style.css`](#2-stylecss)
    - [3. `game.js`](#3-gamejs)
    - [Flujo del juego](#flujo-del-juego)
  - [Tecnologías](#tecnologías)
  - [Estructura del proyecto](#estructura-del-proyecto)
  - [Personalización](#personalización)
  - [Licencia](#licencia)

---

## Qué hace el proyecto

Es una versión jugable del Tetris clásico con todas las mecánicas que esperarías:

- Tablero de **10 × 20** celdas.
- Las **7 piezas estándar** (I, O, T, S, Z, J, L) más la **Tuerca**, una pieza reto 3×3 con hueco central, todas con colores diferenciados.
- **Bomba total**: powerup de 1×1 que, al aterrizar, destruye un área de **5 × 5** a su alrededor (+10 puntos × nivel por bloque destruido).
- **Rotación** con _wall kicks_ básicos (pequeños desplazamientos para que la pieza pueda rotar pegada a la pared).
- **Soft drop** (bajada acelerada) y **hard drop** (caída instantánea).
- **Pieza fantasma** (_ghost piece_): muestra dónde aterrizará la pieza actual.
- **Vista previa** de la siguiente pieza.
- **Sistema de puntuación** clásico de Tetris (100 / 300 / 500 / 800 multiplicado por nivel).
- **Niveles** que aumentan cada 10 líneas y aceleran la caída.
- **Menú de pausa** (`P` o `Esc`) con opciones para reanudar, reiniciar, ver los controles y elegir el **nivel inicial** (1–10) de la siguiente partida, que se guarda en `localStorage`.
- **Game Over** con opción de reinicio.
- **Skins** (temas visuales de las piezas): Retro, Neón, Pastel y Pixel art, seleccionables desde la cabecera y guardadas en el navegador.
- **Pantalla de inicio** con la tabla de récords: el juego no arranca hasta pulsar **Jugar**.
- **Tabla de récords local** (top 5) guardada en `localStorage`, con **mejor combo** y **líneas máximas** en una partida.

### Tabla de récords

- Los récords se guardan en el navegador bajo la clave `tetris.records` con el formato `{ top: [{ name, score, lines, level, date }], bestCombo, maxLines }`.
- Al terminar la partida, si la puntuación entra en el top 5 (y es mayor que 0) se pide un nombre (máx. 12 caracteres, por defecto «Jugador»); se guarda con **Guardar** o con `Enter`, y la fila nueva aparece resaltada junto al mensaje «¡Nuevo récord!».
- **Combo**: número de piezas consecutivas que limpian al menos una línea (se reinicia cuando una pieza no limpia ninguna). Se guarda el mejor combo histórico; no afecta a la puntuación.
- **Líneas máximas**: el mayor número de líneas logrado en una sola partida.
- El botón **Resetear récords** (en la pantalla de inicio y en Game Over) borra todo tras pedir confirmación.
- Si `localStorage` no está disponible o los datos están corruptos, el juego funciona igual con una tabla vacía.

---

## Cómo ejecutar el juego

No hay nada que instalar ni compilar. Tienes dos opciones:

### Opción 1: abrir el archivo directamente

```bash
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

### Opción 2: servidor local (recomendado)

Cualquier servidor estático funciona. Algunos ejemplos:

```bash
# Con Python 3
python3 -m http.server 8000

# Con Node.js (npx)
npx serve .

# Con PHP
php -S localhost:8000
```

Después abre `http://localhost:8000` en el navegador.

---

## Controles

| Tecla     | Acción                            |
| --------- | --------------------------------- |
| `←` / `→` | Mover la pieza horizontalmente    |
| `↑` o `X` | Rotar la pieza en sentido horario |
| `↓`       | Soft drop (bajar más rápido)      |
| `Espacio` | Hard drop (caída instantánea)     |
| `P` / `Esc` | Abrir / cerrar el menú de pausa |

---

## Cómo funciona

El juego se compone de tres archivos que cooperan:

### 1. `index.html`

Define la estructura visual:

- Un `<canvas id="board">` de **300 × 600** píxeles donde se renderiza el tablero.
- Un panel lateral con `SCORE`, `LINES`, `LEVEL`, vista de la siguiente pieza y la lista de controles.
- Un overlay compartido por la **pantalla de inicio**, **PAUSA** y **GAME OVER**: incluye la tabla de récords y el formulario para guardar el nombre, y en pausa muestra el menú `#pause-menu` (Reanudar, Reiniciar, Ver controles y Nivel inicial).
- Un selector `<select id="skin-select">` en la cabecera para elegir la skin de las piezas.

### 2. `style.css`

Aporta el aspecto visual con estética _dark / retro arcade_: fondo oscuro, tipografía monoespaciada para los marcadores y _backdrop blur_ en los overlays.

### 3. `game.js`

Contiene toda la lógica del juego. A grandes rasgos:

- **Modelo del tablero**: una matriz `ROWS × COLS` donde cada celda guarda `0` (vacía) o un índice de color (1–8) que identifica la pieza.
- **Piezas**: definidas como matrices cuadradas. Para rotar se calcula la transposición + reverso de filas (`rotateCW`).
- **Detección de colisiones** (`collide`): comprueba que ninguna celda de la pieza salga del tablero ni se solape con bloques ya fijados.
- **Wall kicks** (`tryRotate`): si la rotación choca, intenta desplazar la pieza ±1 y ±2 columnas antes de descartar el giro.
- **Game loop** (`loop`): basado en `requestAnimationFrame`, acumula el tiempo transcurrido y baja la pieza una fila cuando se supera `dropInterval`.
- **Limpieza de líneas** (`clearLines`): recorre el tablero de abajo hacia arriba; cada fila completa se elimina y se inserta una vacía en la cima.
- **Puntuación**: usa la tabla clásica `[0, 100, 300, 500, 800]` multiplicada por el nivel actual; el hard drop suma 2 puntos por celda recorrida y el soft drop 1 punto por fila.
- **Nivel y velocidad**: la partida empieza en el nivel inicial elegido en el menú de pausa (`tetris.startLevel` en `localStorage`, 1 por defecto) y sube cada 10 líneas: `nivel = nivelInicial + floor(líneas / 10)`. La velocidad de caída la calcula `computeDropInterval(level)` = `max(100, 1000 − (level − 1) × 90)` milisegundos.
- **Menú de pausa**: mientras está abierto se bloquean las teclas del juego (solo funcionan `Tab`/`Enter`/`Espacio` para navegar el menú). Al reanudar se oculta el overlay, se quita el foco del botón y se ignoran las teclas que siguieran pulsadas.
- **Ghost piece** (`ghostY`): proyecta la posición final de la pieza actual hacia abajo y la dibuja con `globalAlpha = 0.2`.
- **Skins** (`SKINS`, `applySkin`): cada skin define su paleta (`colors`), un fondo de canvas opcional (`canvasBg`) y una función `drawCell` que `drawBlock` usa para pintar cada bloque:
  - **Retro**: el estilo clásico, cuadro plano con brillo superior.
  - **Neón**: fondo negro (también en modo claro) y resplandor con `shadowBlur` del color de la pieza.
  - **Pastel**: paleta suave y bloques con esquinas redondeadas.
  - **Pixel art**: bloque con bisel y textura de píxeles claros y oscuros.

  El cambio se aplica al instante (incluso en pausa) y se guarda en `localStorage` con la clave `tetris.skin`.

### Flujo del juego

```
carga de la página → showStartScreen()  (tabla de récords + botón Jugar)
        ↓  clic en Jugar
init()
  ├─ createBoard()                  → matriz vacía
  ├─ next = randomPiece()
  ├─ spawn()                        → mueve next a current y genera nueva next
  └─ requestAnimationFrame(loop)
        ↓
   loop(timestamp)
     ├─ acumula dt
     ├─ si dt ≥ dropInterval → baja la pieza o llama a lockPiece()
     ├─ draw()  (grid + tablero + ghost + pieza actual)
     └─ requestAnimationFrame(loop)

   keydown → mover / rotar / soft-drop / hard-drop / pausa (P o Esc → menú de pausa)
```

Cuando una pieza recién generada ya colisiona al aparecer (`spawn`), se dispara `endGame()` y se muestra el overlay de **Game Over** con la tabla de récords (y el campo de nombre si la puntuación entra en el top 5).

---

## Tecnologías

- **HTML5** — marcado y dos elementos `<canvas>` (tablero y vista previa).
- **CSS3** — _flexbox_, variables de color, `backdrop-filter` y `box-shadow`.
- **JavaScript (ES6+) vanilla** — `const`/`let`, _arrow functions_, _spread operator_, `Array.from`, _template literals_…
- **Canvas 2D API** — para todo el renderizado del juego.
- **`requestAnimationFrame`** — para el bucle de juego sincronizado con el navegador.

**Sin dependencias.** No hay `package.json`, ni bundler, ni transpilador.

---

## Estructura del proyecto

```
03-tetris/
├── index.html      # Estructura del DOM y canvas
├── style.css       # Estilos del juego (dark theme)
├── game.js         # Toda la lógica del Tetris (~300 líneas)
└── README.md
```

---

## Personalización

Algunos parámetros fáciles de tunear en `game.js`:

| Constante      | Significado                              | Por defecto           |
| -------------- | ---------------------------------------- | --------------------- |
| `COLS`         | Columnas del tablero                     | `10`                  |
| `ROWS`         | Filas del tablero                        | `20`                  |
| `BLOCK`        | Tamaño en píxeles de cada celda          | `30`                  |
| `SKINS`        | Skins: paleta, fondo y dibujo de bloques | `retro`               |
| `LINE_SCORES`  | Puntos por 1, 2, 3 o 4 líneas eliminadas | `[0,100,300,500,800]` |
| `BOMB_CHANCE`  | Probabilidad de que salga la bomba total | `0.5` (pruebas)       |
| `dropInterval` | Velocidad inicial de caída en ms         | `1000`                |

> Si cambias `COLS`, `ROWS` o `BLOCK`, recuerda ajustar también `width` y `height` del `<canvas id="board">` en `index.html` para que coincida (`COLS × BLOCK` × `ROWS × BLOCK`).

---

## Licencia

Proyecto de uso libre con fines educativos y de práctica.
