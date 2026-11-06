# `<dex-shell-view>`

One view of [`<dex-app-shell>`](app-shell.md): what the page shows in one of its sides (the left
or the right sidebar, or the bottom panel), and what the shell needs to give it an activity
button. Its children are the view's content. It is a column as wide and as tall as its side, and
scrolls what does not fit. A page writes `side`, and the view puts itself in the shell's slot for
that side.

It draws nothing else. The shell draws its button (its `icon`, with `label` and `shortcut` as the
tooltip) in the order the views are in the page, heads the side with its `label`, and hides each
view of a side but the one it shows. A hidden view stays in the page, so its content keeps its
scroll position and its open rows for when it is shown again. Shown by its shortcut, it takes the
focus: its first control, or the view itself when it has none. Its `view` is the id the shell's
`showView`, `toggleView` and events name it by, one view to an id.

```js
import { defineShellView } from 'data-explorer-view/app-shell';

defineShellView(); // defineAppShell() defines it too
const notes = document.createElement('dex-shell-view');
Object.assign(notes, { side: 'right', view: 'notes', label: 'Notes', icon: 'info', shortcut: 'Mod+Alt+N' });
notes.append(myNotesPanel);
shell.append(notes); // a button on the right activity bar, which shows the panel
```

A view on the `bottom` has its button at the start of the status bar. A shortcut with no Mod,
Ctrl or Alt (a bare key, or Shift and a key) works in a text field too, where the key would have
typed, so a view's chord is best given a modifier.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->
