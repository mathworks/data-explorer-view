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
