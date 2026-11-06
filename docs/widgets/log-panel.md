# `<dex-log-panel>`

The shell's Log, in the bottom panel: what the app did and what went wrong, a line each, oldest
first. appendEntry() adds a line (its time as HH:MM:SS, its level in words and in colour, its
message) and clear() takes them all away; the latest thousand are kept. A toolbar above the lines
filters them by level (All, Warnings, Errors) and clears them. The filter narrows what is shown,
never what is kept: a choice sets `filter` and sends `dex-log-filter-changed`, and Clear sends
`dex-log-cleared`.

The lines are a log region, which a screen reader reads out as lines arrive, and a stop of the
tab order, so the keyboard can scroll them. The newest line stays in view as lines arrive, until
the user scrolls up to read an older one; scrolled back to the bottom, it follows again.

```js
import { defineLogPanel } from 'data-explorer-view/app-shell';

defineLogPanel();
const log = document.querySelector('dex-log-panel');
log.filter = localStorage.getItem('my-app:log-filter') ?? 'all';

log.appendEntry({ level: 'info', message: 'Opened plant.sldd' });
log.appendEntry({ level: 'error', message: 'Could not save gains.mat: the file is read-only.' });
log.addEventListener('dex-log-filter-changed', (e) => {
  localStorage.setItem('my-app:log-filter', e.detail.filter);
});
```

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-log-panel>` | `DexLogPanel` | `defineLogPanel(tag = 'dex-log-panel')` | `data-explorer-view/app-shell` |

## Properties

### `filter`

type `LogFilter` · default `'all'` · attribute `filter`, reflected

Which lines are shown, by the least level: `all` (the default), `warning` (warnings and
errors) or `error`. A choice in the toolbar sets it and sends `dex-log-filter-changed`; set
by the app it sends nothing. A value not one of these is `all`. Attribute `filter`.

## Methods

### `appendEntry(entry: LogEntry): void`

Adds a line at the bottom, dropping the oldest once there are a thousand. Its time is the
entry's `at`, or now; its level is the entry's, or 'info' for one not known. Not `append`:
that is the DOM's own, which puts nodes in the element.

### `clear(): void`

Takes every line away, sending nothing.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-log-filter-changed`

The user chose another level in the toolbar; `filter` is set to it already. Keep it, if the app keeps such things.

`detail` is a `LogFilterChangedDetail`:

```ts
/** What `dex-log-filter-changed` carries: the filter now shown. */
export interface LogFilterChangedDetail {
  filter: LogFilter;
}

/**
 * Which lines are shown, by the least level: 'all' every line, 'warning' warnings and errors,
 * 'error' errors alone.
 */
export type LogFilter = 'all' | 'warning' | 'error';
```

### `dex-log-cleared`

The user pressed Clear, and every line is gone. No detail.

`detail` is `null`.

## Parts it defines

`defineLogPanel()` defines `<dex-log-panel>` alone.

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-bg-primary` | `#fff` |  |
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-border-color-light` | `#e0e0e0` |  |
| `--dex-color-accent` | `#0078d4` |  |
| `--dex-color-error` | `#d32f2f` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-muted` | `#666` |  |
| `--dex-color-warning` | `#d83b01` |  |
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
| `--dex-font-mono` | `'SF Mono', 'Menlo', 'Monaco', monospace` |  |
| `--dex-font-size` | `13px` |  |
