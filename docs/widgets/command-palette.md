# `<dex-command-palette>`

The shell's command palette: a box at the top of the window, over the page, in which a few typed
letters find a command. show() opens it with the commands to offer. The list follows the typing:
labels that begin with the query first, then those whose words it begins, then those that only
hold its letters in order, the letters matched drawn in bold. The commands run lately come first
among equals, and first of all before anything is typed. ArrowUp and ArrowDown move through the
list, wrapping; Enter or a click runs the command, which closes the palette and sends
`dex-palette-run`. A disabled command is listed greyed and runs on neither. Escape, a click
outside it and close() close it, sending nothing.

It is modal, as [`<dex-confirm-dialog>`](confirm-dialog.md) is: while it is open, Tab stays in
its input and no key pressed in it reaches the page. When it closes the focus goes back where it
was, before `dex-palette-run` is sent, so a command that moves the focus itself keeps it there.

```js
import { defineCommandPalette } from 'data-explorer-view/app-shell';

defineCommandPalette();
const palette = document.body.appendChild(document.createElement('dex-command-palette'));

addEventListener('keydown', (e) => {
  if (e.code !== 'KeyP' || !e.shiftKey || !(e.metaKey || e.ctrlKey)) return;
  e.preventDefault();
  palette.show([
    { id: 'save', label: 'Save', category: 'File', shortcut: 'Ctrl+S', disabled: !doc.dirty },
    { id: 'show-log', label: 'Show Log', category: 'View' },
  ]);
});
palette.addEventListener('dex-palette-run', (e) => run(e.detail.id));
```

A command's `shortcut` is only shown: the palette listens for no chord but its own keys. It paints
at z-index 10000, as the dialogs do: append it last in the body.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->
