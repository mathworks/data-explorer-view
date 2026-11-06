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
