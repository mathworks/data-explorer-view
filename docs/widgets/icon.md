# `<dex-icon>`

One of the package's icons, by id: an `<img>` of `icons/<id>.svg`, decorative (hidden from
assistive technology, so the element beside it carries the name). Every widget's define function
defines it, since every widget draws icons; an app uses it for icons of its own that should
match.

Where the icon files are is said once, before the first icon draws: `setIconBase(folder)` for a
folder the app serves, or `useIconAssets()` (`data-explorer-view/icon-assets`) for icons the
app's bundler copies. The README's section on icons has the details.

```js
import { defineIcon, setIconBase } from 'data-explorer-view/icon';

setIconBase('./icons/');
defineIcon();
document.body.insertAdjacentHTML('beforeend', '<dex-icon icon-id="typeBus" size="24"></dex-icon>');
```

A data-model kind (`bus`, `struct`, `signal`, …) is drawn as the icon that stands for it; an id
with no file draws a broken image (nothing, with `mono`), and an empty one draws nothing.

With `mono` the same file is drawn in one colour, the element's own `color`, as a toolbar's glyph
is: its strokes and dark shapes in that colour and its light fills left out, so it follows the
theme and forced colours with no filter. It is an SVG `<image>` of the file, fetched as an `<img>`
is (under `img-src`, and from `file://` too), not a CSS mask, which a `file://` page is refused.
The shell's toolbar, location bar and activity bars draw their icons so under its Minimal icon
style. Each mono icon runs an SVG filter of its own: it is for the handful of glyphs an app's
chrome draws, not for every row of a long list.

```html
<button class="tool"><dex-icon icon-id="undo" mono></dex-icon> Undo</button>
```

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-icon>` | `DexIcon` | `defineIcon(tag = 'dex-icon')` | `data-explorer-view/icon` |

## Properties

### `iconId`

type `string` · default `''` · attribute `icon-id`

The icon's id: the name of its file in `icons/` without `.svg` (`typeBus`), or a data-model
kind (`bus`). Empty, the default, draws nothing. Attribute `icon-id`.

### `size`

type `number` · default `16` · attribute `size`

Its width and height in CSS pixels. Default 16. Attribute `size`.

### `mono`

type `boolean` · default `false` · attribute `mono`

Draws the icon in one colour, the element's `color` (currentColor), as a toolbar's or an
activity bar's glyph: its strokes and dark shapes in that colour, its light fills left out, so
the button's own background shows through them. The dark set's `--dex-icon-filter` is not
applied: the colour is the theme's already. Each mono icon runs an SVG filter of its own, so
it is for the handful of glyphs an app's chrome draws, not for every row of a long list. An id
with no file draws nothing, where the `<img>` draws a broken image. Off, the default, draws the
icon in the colours its file has. Attribute `mono`.

## Methods

None.

## Events

None.

## Parts it defines

`defineIcon()` defines `<dex-icon>` alone.

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-icon-filter` | `none` | A CSS filter over every icon (<dex-icon>). The icons are drawn for a light background, so the light sets leave them as they are. |
