# `<dex-doc-tabs>`

The row of tabs above an app's documents, one per open file, as `tabs` lists them, with `active`
marking the one shown. It draws them and asks for everything else: a click (or Enter or Space) on
a tab sends `dex-tab-select`, its × (or a middle click, Delete or Backspace) `dex-tab-close`, a
double-click `dex-tab-pin`, and a tab dragged onto another `dex-tab-move`. Which tabs there are,
in what order, and which is active stay the app's: the row changes neither `tabs` nor `active`.

A preview tab (a file only being looked at, which the next one opened replaces) has its label in
italics. A tab with unsaved changes shows ● where its × is, until the pointer or the keyboard
comes onto it. A row too long for its width scrolls sideways, keeps the active tab in view, and
has a … button that lists every tab. The arrow keys move along the tabs, and Home and End go to
either end.

```js
import { defineDocTabs } from 'data-explorer-view/app-shell';

defineDocTabs();
const strip = document.querySelector('dex-doc-tabs');
strip.tabs = [
  { id: 'a', label: 'plant.sldd', icon: 'simulinkDataDictionary_FT', title: '/work/plant.sldd', dirty: true },
  { id: 'b', label: 'gains.mat', preview: true },
];
strip.active = 'a';
strip.addEventListener('dex-tab-select', (e) => (strip.active = e.detail.id));
strip.addEventListener('dex-tab-close', (e) => closeTab(e.detail.id)); // ask first, when it is dirty
strip.addEventListener('dex-tab-move', (e) => {
  const tab = strip.tabs.find((t) => t.id === e.detail.id);
  const rest = strip.tabs.filter((t) => t !== tab);
  rest.splice(e.detail.index, 0, tab); // its index once moved
  strip.tabs = rest;
});
```

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->
