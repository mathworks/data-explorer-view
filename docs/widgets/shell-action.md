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

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-shell-action>` | `DexShellAction` | `defineShellAction(tag = 'dex-shell-action')` | `data-explorer-view/app-shell` |

## Properties

### `side`

type `'left' | 'right'` · default `'left'` · attribute `side`, reflected

The activity bar the button is in: `left` or `right`. Default `left`. Attribute `side`.

### `action`

type `string` · default `''` · attribute `action`, reflected

The action's id: `dex-shell-action`'s `actionId`, and what the shell's `anchorOf` takes. An
action without one is not drawn. Attribute `action`.

### `label`

type `string` · default `''` · attribute `label`, reflected

What the action is called: its button's tooltip and accessible name. Attribute `label`.

### `icon`

type `string` · default `''` · attribute `icon`, reflected

The id of the icon its button draws (`<dex-icon>`'s `iconId`). Attribute `icon`.

### `shortcut`

type `string` · default `''` · attribute `shortcut`, reflected

The keyboard chord that presses the button, written as a view's `shortcut` is, and like one
heard in a text field too when it has no Mod, Ctrl or Alt. Default none. Attribute `shortcut`.

## Methods

None.

## Events

None.

## Parts it defines

`defineShellAction()` defines `<dex-shell-action>` alone.

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
