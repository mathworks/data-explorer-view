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

One inspector beside several tables (a table per tab) follows the active one: `follow(feed)`
switches it to another table's handle, with the same options and listeners, and `follow(null)`
shows the empty state until a table is followed again. Connect it with `null` to start with none.
A grid the inspector opened closes as it switches; one a table opened in a shared editor stays.

```js
const inspector = connectInspector(element, null, { empty: placeholder, variableEditor: editor });
// as a tab becomes active, and when the last one closes:
inspector.follow(activeTab ? activeTab.handle : null);
```

Beside a table connected with `inspectorPages` (see the [tree table](tree-table.md)), it shows
more than one row's properties: the file's own page while no row is selected (what the file is,
where it is, whether it holds edits, and the open files it references and is referenced by, each
a link), a section heading's (its entries counted by type), "3 selected" for several rows, and a
row's Usage links as a group of their own.

With `editing` and `inspectorEditing` too, a row is editable where the document takes an edit of
it. Such a row carries its property's `key`, and is drawn as a field: a list where it has
`options`, a field of several lines where it is `multiline`, a text field otherwise. A change of
one is `dex-property-changed`, with the row's `key`, and connectInspector hands it to the feed's
`edit` (a table's handle has one), which writes it as a cell edit of the page's row: a refusal
opens the table's error dialog, and the field is put back. A field the user is typing in keeps
what they typed while a page is pushed again. `connected.commit()` (the inspector's `commit()`)
sends what is typed in the field the focus is in, as leaving it would, for an app's Save to call
before the table's `commitEdit()`, which then waits for it.

```js
const handle = connectTable(table, doc.table, { editing: true, inspectorPages: true, inspectorEditing: true });
const connected = connectInspector(inspector, handle, { empty: placeholder });
// The file's page says whether the document holds edits, which the table does not hear of.
doc.onDirty(() => handle.refreshInspector());

async function save() {
  connected.commit(); // a field the focus is still in, on a Save chord
  await handle.commitEdit();
  write(doc.serialize());
}
```

Without connectInspector, set `groups` yourself: `(await source.inspect(rowIds)).groups`, or the
model's buildPropertyGroups of a node. `source.inspect(rowIds, { pages: true, editable: true })`
asks a document opened in the page for the same pages and editable rows; a source across a
channel answers as it would without them.

A read-only row marked `multiline` is a text of several lines as it was written: its line breaks
and spaces kept, in the theme's monospace face (`--dex-font-mono`), on a framed box that scrolls
past a height. The box is a tab stop named by its row (`tabindex="0"`, `aria-label`), ringed with
`--dex-focus-ring` while it has the keyboard, so a keyboard user can reach it and scroll it with
the arrow keys in any browser, not only in Chromium, where a box that scrolls is one already. The
shell's MATLAB group shows MATLAB's display of a value this way, a matrix's columns lined up as
MATLAB laid them out. buildPropertyGroups marks only editable rows `multiline` (their field of
several lines), so its read-only rows read as they always did.

```js
inspector.groups = [{ title: 'MATLAB', properties: [{ name: 'In MATLAB', value: '    16     2\n     5    11', multiline: true }] }];
```

The inspector's matrix rows draw [`<dex-matrix-open>`](matrix-open.md), which opens the same
[variable editor](variable-editor.md) as the table's.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-property-inspector>` | `DexPropertyInspector` | `definePropertyInspector(tag = 'dex-property-inspector')` | `data-explorer-view/property-inspector` |

## Properties

### `groups`

type `PropertyGroup[]` · default `[]` · property only

The groups shown, in order; none, the default, draws an empty panel. Property only.

## Methods

### `commit(): void`

Commit the field the focus is in, as leaving it would: `dex-property-changed`, if what it holds
is not its row's value. For an app's Save, which a chord gives with the focus still in the field,
to take what was typed there. Nothing when the focus is in no field.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-property-changed`

An editable row's field was changed and committed (its change event).

`detail` is a `PropertyChangedDetail`:

```ts
/** What `dex-property-changed` carries: the property's name, its new text and the text it had. */
export interface PropertyChangedDetail {
  propName: string;
  /**
   * The property's key (its row's `key`), which an edit of it names as its column; absent for a
   * row that has none.
   */
  key?: string;
  newValue: string;
  oldValue: string;
}
```

### `dex-property-navigate`

A link was clicked: a link row's name (`sourceId` is its `linkTarget`, else its name) or a
value link (its `valueLink`).

`detail` is a `PropertyNavigateDetail`:

```ts
/** What `dex-property-navigate` carries: the target of the link clicked. */
export interface PropertyNavigateDetail {
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
