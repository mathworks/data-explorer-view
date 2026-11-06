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

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-doc-tabs>` | `DexDocTabs` | `defineDocTabs(tag = 'dex-doc-tabs')` | `data-explorer-view/app-shell` |

## Properties

### `tabs`

type `DocTab[]` · default `[]` · property only

The tabs, in order: plain data, which the app replaces as files open, close and move. Default none.

### `active`

type `string` · default `''` · attribute `active`, reflected

The id of the tab shown, which is marked selected and scrolled into view. Default none. Attribute `active`.

## Methods

None.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-tab-select`

Show this tab: a click on it, Enter or Space on it, or its item in the … menu. Sent for the active tab too.

`detail` is a `TabSelectDetail`:

```ts
/** What `dex-tab-select` carries: the tab to show. */
export interface TabSelectDetail {
  id: string;
}
```

### `dex-tab-close`

Close this tab: its ×, a middle click on it, or Delete (or Backspace) on it.

`detail` is a `TabCloseDetail`:

```ts
/** What `dex-tab-close` carries: the tab to close. */
export interface TabCloseDetail {
  id: string;
}
```

### `dex-tab-pin`

Keep this tab, no longer a preview: a double-click on it, whether it is a preview or not. Its
two clicks have each sent `dex-tab-select` first.

`detail` is a `TabPinDetail`:

```ts
/** What `dex-tab-pin` carries: the tab to keep, no longer a preview. */
export interface TabPinDetail {
  id: string;
}
```

### `dex-tab-move`

Move this tab: it was dropped on the tab at `index`. Remove it from `tabs`, then insert it at `index`.

`detail` is a `TabMoveDetail`:

```ts
/**
 * What `dex-tab-move` carries: the tab dragged, and its index once moved, which is the index of the
 * tab it was dropped on. Remove it from `tabs`, then insert it at `index`.
 */
export interface TabMoveDetail {
  id: string;
  index: number;
}
```

## Parts it defines

`defineDocTabs()` defines these first, under their default names, then `<dex-doc-tabs>`:

- [`<dex-icon>`](icon.md)

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-active` | `#e0e0e0` |  |
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-bg-primary` | `#fff` |  |
| `--dex-bg-tabbar` | `#f0f0f0` |  |
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-color-accent` | `#0078d4` |  |
| `--dex-color-accent-hover` | `#005a9e` |  |
| `--dex-color-modified` | `#b45309` | The Status column's "Modified". |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-muted` | `#666` |  |
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
