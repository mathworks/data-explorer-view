# `<dex-command-window>`

A MATLAB-style command window: the output of the commands run so far, over a `>>` prompt. It runs
nothing itself. Enter shows the line after the prompt, keeps it in the history and sends
`dex-command-run`; the app runs the line and hands the answer to appendOutput(), whose lines are
drawn as text in their kind's colour (output, an error, a note). ArrowUp and ArrowDown recall the
lines run, newest first, and only those that begin with what is typed when something is, as
MATLAB's do; Escape empties the prompt. The output keeps its newest `maxLines` lines and scrolls
to the newest.

An app runs a line with `runCommand` (`data-explorer-view/model`), the interpreter, over its
open documents (a `CommandTarget`): `help`, `ls`, `info`, `json`, `set`, `add`, `rm`, `save`
and MATLAB's own `Kp`, `Kp = 3` and `Kp.Description = 'gain'`. Each change is the edit the
table would make, so what the document takes, refuses and undoes is the same either way. It
runs no JavaScript.

```js
import { defineCommandWindow } from 'data-explorer-view/app-shell';
import { runCommand } from 'data-explorer-view/model';

defineCommandWindow();
const terminal = document.querySelector('dex-command-window');

terminal.addEventListener('dex-command-run', async (e) => {
  // target: the open documents, and the active table's rows and commands (a CommandTarget)
  terminal.appendOutput(await runCommand(e.detail.line, target));
});
terminal.appendOutput({ lines: [{ text: 'Opened plant.sldd', kind: 'info' }] });
```

Its first welcome line names the app, from its `heading` (connectShell gives it the `appName`).
clear() empties the output (`clc` asks for the same, by the answer's `clear`), and focusInput()
gives the prompt the keyboard.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-command-window>` | `DexCommandWindow` | `defineCommandWindow(tag = 'dex-command-window')` | `data-explorer-view/app-shell` |

## Properties

### `maxLines`

type `number` · default `5000` · attribute `max-lines`

The most lines the output keeps; past it the oldest go, so a long session does not grow the
page without bound. Default 5000. Attribute `max-lines`.

### `heading`

type `string` · default `'Data Explorer'` · attribute `heading`

The app the welcome's first line names, "<heading> — Command Window". Default 'Data Explorer'.
Attribute `heading`.

## Methods

### `appendOutput(output: CommandOutput): void`

Show a command's answer: its lines, after the ones there, or in place of every line where the
answer says `clear`. Not `append`, which every element has already, for its child nodes.

### `clear(): void`

Empty the output, the welcome lines included. The prompt and its history stay.

### `focusInput(): void`

Give the prompt the keyboard (once it is drawn, when called before).

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-command-run`

Enter was pressed on a line that is not blank: run it. The window has shown the line after the
prompt, kept it in its history and emptied the prompt; the app runs it and hands the answer to
`appendOutput()`.

`detail` is a `CommandRunDetail`:

```ts
/** What `dex-command-run` carries: the line typed at the prompt, without the spaces around it. */
export interface CommandRunDetail {
  line: string;
}
```

## Parts it defines

`defineCommandWindow()` defines `<dex-command-window>` alone.

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-primary` | `#fff` |  |
| `--dex-border-color-light` | `#e0e0e0` |  |
| `--dex-color-accent` | `#0078d4` |  |
| `--dex-color-error` | `#d32f2f` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-muted` | `#666` |  |
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
| `--dex-font-mono` | `'SF Mono', 'Menlo', 'Monaco', monospace` |  |
