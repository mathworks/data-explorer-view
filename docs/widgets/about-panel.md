# `<dex-about-panel>`

The shell's About popover, opened from the (i) button on an activity bar: a heading (the app's
name) and the lines the app hands it, each a label and its value (the app's version, the
versions of what it is built on). What the app gives is drawn as text, never as markup. show()
opens it beside the button that opened it, as the [Settings popover](settings-panel.md) opens;
Escape, a press outside it or close() closes it, and the focus goes back to the button. It sends
nothing.

```js
import { defineAboutPanel } from 'data-explorer-view/app-shell';

defineAboutPanel();
const about = document.body.appendChild(document.createElement('dex-about-panel'));
about.heading = 'My app';
about.lines = [
  { label: 'Version', value: '1.0.0' },
  { label: 'data-explorer-view', value: '1.8.0' },
];
aboutButton.addEventListener('click', () => about.show(aboutButton.getBoundingClientRect()));
```

connectShell fills it from its `appName` and `about` options, and opens it from the shell's About
button.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->
