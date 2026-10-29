# `<dex-property-inspector>`

The properties of one entry: titled groups of name–value rows, some of them editable, some
links, some matrices with the glyph that opens them. It holds no data and follows no selection
of its own: it shows the `groups` it is given, and says what the user does through events.

`connectInspector` gives it a feed to follow: a connected table's handle (the table's
selection, shown by the rule the model holds: the FIRST selected row, and nothing for a section
heading or a row that is gone), or the pages a host sends across a channel (`inspectorFeed`).
It shows each page, shows the `empty` element instead while there is nothing, opens the
variable editor from the Value row's glyph, and hands a clicked cross-reference to the app.

```js
import 'data-explorer-view/theme.css';
import { connectInspector, definePropertyInspector } from 'data-explorer-view/property-inspector';

definePropertyInspector();
const inspector = document.createElement('dex-property-inspector');
document.body.append(inspector);

// `handle` is connectTable's: the inspector follows that table, and shares its variable editor.
const connected = connectInspector(inspector, handle, { empty: placeholder });
connected.on('navigate', (target) => goTo(target)); // a cross-reference, `name@source`
```

Without connectInspector, set `groups` yourself: `(await source.inspect(rowIds)).groups`, or the
model's buildPropertyGroups of a node.

The inspector's matrix rows draw [`<dex-matrix-open>`](matrix-open.md), which opens the same
[variable editor](variable-editor.md) as the table's.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-property-inspector>` | `DexPropertyInspector` | `definePropertyInspector(tag = 'dex-property-inspector')` | `data-explorer-view/property-inspector` |

## Properties

### `groups`

type `PropertyGroup[]` · default `[]` · attribute `groups`

The groups shown, in order; none, the default, draws an empty panel. Attribute `groups` (JSON).

## Methods

None.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-property-changed`

An editable row's field was changed and committed (its change event).

`detail` is a `PropertyChangedDetail`:

```ts
export interface PropertyChangedDetail {
  propName: string;
  newValue: string;
  oldValue: string;
}
```

### `dex-pi-navigate`

A link was clicked: a link row's name (`sourceId` is its `linkTarget`, else its name) or a
value link (its `valueLink`).

`detail` is a `PiNavigateDetail`:

```ts
export interface PiNavigateDetail {
  sourceId: string;
}
```

## Parts it defines

`definePropertyInspector()` defines these first, under their default names, then `<dex-property-inspector>`:

- [`<dex-matrix-open>`](matrix-open.md)

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-border-color-light` | `#e0e0e0` |  |
| `--dex-color-accent` | `#0078d4` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-secondary` | `#555` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
