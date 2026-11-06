# `<dex-location-bar>`

Back, Forward and Up, then a breadcrumb of where the user is: one segment for each place on the
way down to it (Root › plant.sldd › Design Data › Kp), the last drawn as the current place. It
keeps no history and works out no path. Each press is a request, `dex-location-go`, naming Back,
Forward, Up or the segment pressed; the app decides where that goes, gives the bar the new
segments, and says by `canBack`, `canForward` and `canUp` which buttons can be used. A path too
long for the bar shrinks its segments, each label ending in an ellipsis, and a segment's `title`
says what its label leaves out.

```js
import { defineLocationBar } from 'data-explorer-view/app-shell';

defineLocationBar();
const bar = document.querySelector('dex-location-bar');
bar.segments = [
  { label: 'Root' },
  { label: 'plant.sldd', icon: 'simulinkDataDictionary_FT', title: '/work/plant.sldd' },
  { label: 'Design Data' },
  { label: 'Kp', icon: 'parameter' }, // an icon id, or a data-model kind
];
bar.canBack = places.canBack;
bar.canUp = true;
bar.addEventListener('dex-location-go', (e) => {
  const { to } = e.detail; // 'back', 'forward', 'up', or a segment's index
  go(to);
});
```

Back and Forward send nothing while their `can-back` and `can-forward` are off, and Up nothing
while `can-up` is. A press of the last segment, the current place, is sent all the same.

A segment with `preview` is a place only looked at, not gone to (a file selected in a graph): it
is drawn dimmed after the current place, which is then the segment before it, and a press on it
is sent as on any other. A segment's `description` is what a screen reader hears of it past its
label, such as why it is dimmed.

```js
bar.segments = [
  { label: 'Root' },
  { label: 'plant.sldd', icon: 'simulinkDataDictionary_FT', preview: true, description: 'selected in the graph' },
];
```

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-location-bar>` | `DexLocationBar` | `defineLocationBar(tag = 'dex-location-bar')` | `data-explorer-view/app-shell` |

## Properties

### `segments`

type `LocationSegment[]` · default `[]` · property only

The places on the way to where the user is, the first at the top and the last the current place. Default none.

### `canBack`

type `boolean` · default `false` · attribute `can-back`

Back can be used: there is a place to go back to. Off, the default, disables it. Attribute `can-back`.

### `canForward`

type `boolean` · default `false` · attribute `can-forward`

Forward can be used: the user went back, and can go forward again. Off, the default, disables it. Attribute `can-forward`.

### `canUp`

type `boolean` · default `false` · attribute `can-up`

Up can be used: the current place is inside another one. Off, the default, disables it. Attribute `can-up`.

### `mono`

type `boolean` · default `false` · attribute `mono`, reflected

Draws the icons of Back, Forward and Up in one colour, the text's (`<dex-icon mono>`), as a
toolbar's glyphs; off, the default, draws them in their files' colours. A segment's icon is a
file's or an entry's kind, which its colours tell apart, and keeps them either way. Attribute
`mono`, reflected so a page's stylesheet can follow it.

## Methods

None.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-location-go`

The user asked to move: Back, Forward or Up was pressed (only while `canBack`, `canForward`
or `canUp` says it can be), or a segment was, the last one included. The bar changes nothing
itself; the app moves, and gives it the new segments.

`detail` is a `LocationGoDetail`:

```ts
/** What `dex-location-go` carries: where the user asked to go. */
export interface LocationGoDetail {
  /** Back, Forward or Up was pressed; or a segment, by its index in `segments`. */
  to: 'back' | 'forward' | 'up' | number;
}
```

## Parts it defines

`defineLocationBar()` defines these first, under their default names, then `<dex-location-bar>`:

- [`<dex-icon>`](icon.md)

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-active` | `#e0e0e0` |  |
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-bg-primary` | `#fff` |  |
| `--dex-bg-secondary` | `#f8f8f8` |  |
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-border-color-light` | `#e0e0e0` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-disabled` | `#999` |  |
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
