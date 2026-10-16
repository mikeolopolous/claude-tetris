---
description: Crea un worktree aislado en .trees/<nombre> y ejecuta ahí el requerimiento
argument-hint: <requerimiento>
allowed-tools: Bash(git worktree:*), Bash(git branch:*), Bash(git status:*), Bash(git rev-parse:*), Bash(git -C:*), Read, Edit, Write, Glob, Grep
---

# /worktree

Requerimiento recibido:

<requerimiento>
$ARGUMENTS
</requerimiento>

Sigue estos pasos en orden.

## 1. Validar el requerimiento

Si el requerimiento está vacío, pide al usuario que lo describa y detente. No crees ningún worktree.

## 2. Determinar el nombre

Deriva `<nombre>` a partir del requerimiento:

- kebab-case, 2–4 palabras, máximo ~30 caracteres.
- Solo ASCII en minúsculas: sin acentos, ñ → n, sin espacios ni símbolos.
- Debe describir la funcionalidad. Ejemplos:
  - "menú de pausa completo" → `menu-pausa`
  - "tabla de records local" → `tabla-records`
  - "temas visuales / skins" → `skins-visuales`

## 3. Evitar colisiones

Desde la raíz del repo (`git rev-parse --show-toplevel`), comprueba:

- `git worktree list` no contiene `.trees/<nombre>`.
- `git rev-parse --verify --quiet <nombre>` no encuentra una rama con ese nombre.

Si alguno existe, añade sufijo `-2`, `-3`, … hasta encontrar uno libre.

## 4. Crear el worktree

Desde la raíz del repo:

```bash
git worktree add .trees/<nombre> -b <nombre>
```

Si falla, muestra el error exacto y detente.

## 5. Trabajar solo dentro del worktree

Define `WT=<raíz>/.trees/<nombre>`. A partir de aquí:

- Usa rutas absolutas bajo `$WT` en Read, Edit, Write, Glob y Grep.
- En Bash usa `git -C "$WT" …` o `cd "$WT" && …`.
- **Prohibido** modificar archivos del checkout principal (fuera de `$WT`).
- Lee `$WT/CLAUDE.md` y respeta sus convenciones (textos de UI en español, sin dependencias, etc.).

## 6. Implementar el requerimiento

Implementa el requerimiento completo dentro de `$WT`. Para verificar en el navegador, sirve el worktree:

```bash
cd "$WT" && python3 -m http.server 8001
```

No hagas commit ni push salvo que el requerimiento lo pida explícitamente.

## 7. Reporte final

Al terminar, informa:

- Ruta del worktree y nombre de la rama.
- Archivos modificados (`git -C "$WT" status --short`).
- Cómo verificar los cambios.
- Cómo limpiar cuando ya no se necesite:

```bash
git worktree remove .trees/<nombre>
git branch -D <nombre>
```
