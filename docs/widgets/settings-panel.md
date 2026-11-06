# `<dex-settings-panel>`

The shell's Settings popover, opened from the gear on an activity bar: the theme (Light, Dark,
Hi-Con, Auto) and the toolbar's density (Normal, Compact), each a row of segments that is a radio
group. It shows `settings` and asks for a change: a click, or an arrow key inside a row, sends
`dex-settings-change` with the whole new record, and the panel changes nothing by itself. The app
applies the settings, keeps them, and sets `settings` back. The popover stays open meanwhile, so
the themes can be tried one after another.

show() opens it beside the button that opened it, focused on the chosen theme. Escape, a press
outside it or close() closes it, and the focus goes back to the button.

```js
import { defineSettingsPanel } from 'data-explorer-view/app-shell';

defineSettingsPanel();
const panel = document.body.appendChild(document.createElement('dex-settings-panel'));
panel.settings = { theme: 'auto', toolbar: 'normal' };

shell.addEventListener('dex-shell-action', (e) => {
  if (e.detail.actionId === 'settings') panel.show(e.detail.anchor);
});
panel.addEventListener('dex-settings-change', (e) => {
  const { theme, toolbar } = e.detail.settings;
  document.documentElement.dataset.theme = theme === 'auto' ? systemTheme() : theme; // theme.css reads it
  toolbarElement.compact = toolbar === 'compact';
  panel.settings = e.detail.settings;
  localStorage.setItem('my-app:settings', JSON.stringify(e.detail.settings));
});
```

connectShell does all of this, and draws the page in the saved theme as it starts, before
Settings is first opened; Auto follows the system's light, dark or high-contrast scheme as it
changes.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->
