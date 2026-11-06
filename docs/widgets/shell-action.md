# `<dex-shell-action>`

A button on an activity bar of [`<dex-app-shell>`](app-shell.md) that is no view: Settings,
About, anything that opens a popover of the page's rather than a side. The shell draws it at the
end of its bar, after the views' buttons, and a press of it (or of its `shortcut`) sends
`dex-shell-action` from the shell, with the action's id and the button's box, for the page to
open what it stands for against. The element itself draws nothing, and nothing put inside it is
shown.

```js
import { defineAboutPanel, defineShellAction } from 'data-explorer-view/app-shell';

defineShellAction(); // defineAppShell() defines it too
defineAboutPanel();
const about = document.body.appendChild(document.createElement('dex-about-panel'));

shell.insertAdjacentHTML('beforeend', '<dex-shell-action side="left" action="about" label="About" icon="info"></dex-shell-action>');
shell.addEventListener('dex-shell-action', (e) => {
  if (e.detail.actionId === 'about') about.show(e.detail.anchor);
});
```

`shell.anchorOf('about')` answers the same box later, for a command that opens the popover with
no press of the button. An action without an `action` id, or with one another action has, is not
drawn.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->
