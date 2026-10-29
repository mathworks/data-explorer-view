# `<dex-tree-table>`

The table of a document: its sections, entries, variables or blocks as a tree, with a search
bar, columns the user sorts, resizes, reorders, hides and filters on, cell editors, row drag
and drop, links, the glyph that opens a matrix, and the `+ Add` gallery. It virtualises its
rows, so a dictionary of a hundred thousand entries scrolls as a small one does.

It holds no document. The app gives it rows (the model builds them from what core read) and
answers what it asks for; every user action goes out as a `dex-*` event, and the table never
changes the document itself. Its defaults are a full editor: `readonly` makes it a viewer,
`canAdd` and `rowDrag` turn the `+ Add` button and dragging on and off.

```js
import 'data-explorer-view/theme.css';
import { defineTreeTable } from 'data-explorer-view/tree-table';
import {
  COLUMN_GROUPS, COLUMN_LABELS, COLUMNS, LAZY_ROW_BUDGET, getModelFromBytes, rowPlannerFor,
} from 'data-explorer-view/model';

defineTreeTable();
const table = document.createElement('dex-tree-table');
table.storageKey = 'my-app';     // this app's column choices, not every table's
table.readonly = true;           // a viewer
table.expandTopLevel = true;     // open the sections, then keep what the user opens
document.body.append(table);

const node = getModelFromBytes(uri, name, bytes); // core reads the file
table.columns = COLUMNS;
table.columnLabels = COLUMN_LABELS;
table.columnGroups = COLUMN_GROUPS;
table.rows = rowPlannerFor(name).payload(node, LAZY_ROW_BUDGET).rows;

table.addEventListener('dex-row-selected', (e) => {
  showProperties(e.detail.rowIds);  // string[]: typed, no cast
});
table.addEventListener('dex-request-children', (e) => {
  // a row whose children the payload held back was opened: append them to table.rows
  // (the model's childRowsMessage and mergeChildRows)
});
```

See also the [context menu](context-menu.md) (its items for a selection come from
`buildContextMenuItems`, exported here), the [error dialog](error-dialog.md) and the
[variable editor](variable-editor.md) a matrix glyph opens.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-tree-table>` | `DexTreeTable` | `defineTreeTable(tag = 'dex-tree-table')` | `data-explorer-view/tree-table` |

## Properties

### `rows`

type `TreeTableRow[]` · default `[]` · attribute `rows`

The rows, flat: each names its parent by `ID` (`parent`, null at the top level), and
siblings show in the order given until the user sorts. What the model's buildRows (or
buildMatRows) makes of a document. Default none. Attribute `rows` (JSON); set the property.

### `selectedRowIds`

type `string[]` · default `[]` · attribute `selectedrowids`

The ids of the selected rows. The table changes it as the user selects, and says so with
`dex-row-selected`; setting it sends nothing. Default none. Attribute `selectedrowids` (JSON).

### `rowHeight`

type `number` · default `26` · attribute `rowheight`

A row's height in CSS pixels, which virtual scrolling lays the rows out at: the
`--dex-row-height` token when the page sets one, else this. Default 26. Attribute `rowheight`.

### `tableStyle`

type `'normal' | 'light'` · default `'normal'` · attribute `table-style`, reflected

`normal`, the default, rules every cell; `light` drops the lines between columns and keeps a
faint one between rows. Reflected to the attribute `table-style`.

### `columnLabels`

type `Record<string, string> | null` · default `null` · attribute `columnlabels`

Each column's header text, by column key (`{ DataType: 'Data Type' }`), also the name a
search may qualify a term with (`"Data Type":double`); a column with none shows its key.
Default null. Attribute `columnlabels` (JSON).

### `columnGroups`

type `Record<string, string> | null` · default `null` · attribute `columngroups`

The group heading each column sits under in the Columns menu, by column key. Default null:
no headings. Attribute `columngroups` (JSON).

### `columns`

type `string[] | null` · default `null` · attribute `columns`

The column keys this document has, which the Columns menu offers; the user's saved order and
choice of hidden ones apply within them. Default null: the built-in set. Attribute `columns`
(JSON).

### `loading`

type `boolean` · default `false` · attribute `loading`

The rows are on their way: while there are none, the table says Loading… (with a spinner,
after half a second) instead of "No data"; the search bar stays. Set it while a document is
read. Default false. Attribute `loading`.

### `canAdd`

type `boolean` · default `false` · attribute `canadd`

Whether this view can create entries, i.e. whether the `+ Add` button (and its gallery,
whose tiles send `dex-add-entry`) exists at all. Default false. Attribute `canadd`.

### `addClasses`

type `readonly string[] | null` · default `null` · property only

The classes a MAT-file's gallery offers, as its host says core lists them (setRows'
`add: {classes}`), or null, the default, for a dictionary's gallery, which offers every tile.
The gallery draws the tiles of these classes only (matCatalog). Property only.

### `rowDrag`

type `boolean` · default `true` · attribute `rowdrag`

Whether a row can be dragged, or a dragged row let go over one. False where the document is
read-only (table-main sets it from setRows' `editable`): no row is draggable, and a drag from
another table draws no drop target here, on a row or on the empty body. Default true.
Attribute `rowdrag`.

### `readonly`

type `boolean` · default `false` · attribute `readonly`, reflected

A viewer: the user selects, opens, searches, sorts, filters and copies, and changes nothing.
No cell editor opens — not on a double-click, not on Enter, not for beginRename or
openWholeValueEditor — and no cell is drawn as editable; the `+ Add` button is not drawn
whatever canAdd says, and no row is dragged or takes a drop whatever rowDrag says. So none of
the events those gestures send (dex-edit-completed, dex-edit-text-request, dex-add-entry,
dex-row-drag-start, dex-row-drop) is sent. A right-click still sends dex-table-context-menu:
what a read-only menu offers is the app's to say (buildContextMenuItems with editable false).
False, the default, is the table as it always was, each cell's own flags deciding. Reflected
to the attribute `readonly`.

### `storageKey`

type `string | null` · default `'dex'` · attribute `storage-key`

Where the user's column choices (which are shown, and their order) are kept: the page's
localStorage, under `<storageKey>-column-order`, `<storageKey>-hidden-columns` and
`<storageKey>-known-columns`. The default, 'dex', is the keys every table has always used,
so a layout saved before this existed carries over — and every table on the page that keeps
the default shares one layout. An app gives each kind of table a key of its own, or null
(or '') to keep the choices for this element's life only, with localStorage never touched.
They are read when the table is connected, so a key set before then is the only one read; one
set later reads again, from that key. Attribute `storage-key`.

### `selectedRowId`

type `string` · property only

The last of `selectedRowIds`, or '' when nothing is selected; set, it selects that row alone
('' selects nothing). Sends nothing.

### `expandedIds`

type `Set<string>` · property only

The rows shown open, by id: a copy, the caller's to keep.

Set it to open exactly these rows — an expansion the app saved, or the one it read before
giving the table new rows (nextExpandedIds keeps those that still exist). An id with no row is
kept, and opens its row if one comes. Setting it fetches nothing; expand() is the twisty's
click, which asks for children the payload held back.

### `expandTopLevel`

type `boolean` · default `false` · attribute `expand-top-level`

The expansion an app otherwise keeps around every assignment of `rows`, kept by the table
(nextExpandedIds): the first rows with any in them open their top level — a dictionary's
sections, a MAT-file's variables, though not one whose children were held back, whose first
click fetches — and from then on the rows the user opened stay open while they exist, and
what they closed stays closed. Off, the default, a change of `rows` leaves the expansion as it
was, to the app (expandedIds). Attribute `expand-top-level`.

### `dropPredictor`

type `((targetRowId: string, mode: 'copy' | 'move') => { canDrop: boolean; cursor: string; tooltip: string; noop: boolean } | null) | null` · default `null` · property only

Predicts a drop for the row under the cursor ('' for the empty body), injected by the
host-side glue (table-main) and backed by the pure dropDecision: whether it may drop, the
cursor and the tooltip to show, and whether it would change nothing. Returns null when it
cannot predict — no drag it was told about, or a target with no rule — and null REFUSES:
with glue present, "cannot say" is not "yes". Only a table with no predictor at all, the
default, falls back to the built-in permissive drag behavior, so it is usable without the
glue. Property only.

## Methods

### `expand(ids: Iterable<string>): void`

Opens these rows as a click on each one's twisty does: a row with nothing under it stays
closed, and a row whose children the payload held back (`_lazy`) asks for them once
(dex-request-children). Read off `rows` as they are now, so it may follow an assignment of
them directly.

### `collapse(ids: Iterable<string>): void`

Closes these rows.

### `toggleAddGallery(): void`

Open or close the Add gallery, anchored under the Add button.

Public because the keyboard's way in comes from outside this element: the host's
`dataExplorer.addEntry` command posts `openAddGallery`, and table-main calls this. It
TOGGLES, so the accelerator behaves exactly as the button does rather than being a
second, subtly different way to open the same popover.

Opening is one flag because the popover is anchored in CSS, so both callers land on the
same geometry without either of them measuring anything. A view that cannot add has no
Add button and nothing to open — the command is a no-op there, which is the right answer
for a read-only .slx: the keybinding's `when` clause already excludes that view, but the
Command Palette does not have to.

### `beginRename(rowId: string): boolean`

Open the inline name editor on a row, from outside the component.

The host asks for this after creating an entry from the gallery (`beginRename`), and it
goes through the very path a double-click takes — `_cellEditTarget`, which is the one
place that knows whether a cell may be edited at all. So a row whose Name the host would
refuse gets no editor rather than one whose commit bounces. Returns whether the editor
opened, so a caller can keep holding a request whose row has not arrived yet.

### `openWholeValueEditor(rowId: string, text: string): void`

Open the Value editor of `rowId` on `text`, the whole value its summary stands for, which the
host sent in answer to this table's `dex-edit-text-request`. In the textarea, as the text is one
long line of up to 200,000 characters; committed unchanged it posts nothing, and changed it
posts the whole text. Only the answer to the last request opens an editor, and only while no
other editor is open and the cell still takes this one: an answer that arrives after the user
moved on opens nothing.

### `focusFilter(): void`

Focus (and select) the search input — e.g. for a Ctrl+F shortcut.

### `flashRow(rowId: string): void`

Flashes a row's background once, on the next render, as a copy does; nothing if it is not drawn.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, so a listener's `e.detail` is typed with no cast.

### `dex-add-entry`

A tile of the `+ Add` gallery was clicked: add one entry of that class, renaming it if `rename`.

`detail` is a `AddEntryDetail`:

```ts
export interface AddEntryDetail extends AddTileDetail {
  rename: boolean;
}

export interface AddTileDetail {
  className: string;
  section: string;
  label: string;
}
```

### `dex-request-children`

A row whose children the payload held back (`_lazy`) was opened: answer with its rows.
Asked once until its rows arrive.

`detail` is a `RequestChildrenDetail`:

```ts
export interface RequestChildrenDetail {
  nodeId: string;
}
```

### `dex-table-context-menu`

A right-click on a row (after selecting it) or on the space under the rows: open a context
menu there.

`detail` is a `TableContextMenuDetail`:

```ts
export interface TableContextMenuDetail {
  x: number;
  y: number;
  rowId: string | null;
  graphTarget?: string;
}
```

### `dex-row-selected`

The user changed the selection: a click, Ctrl/Cmd- or Shift-click, a key, select-all, or a
right-click on a row not in it.

`detail` is a `RowSelectedDetail`:

```ts
export interface RowSelectedDetail {
  rowIds: string[];
}
```

### `dex-row-drag-start`

The user started dragging rows.

`detail` is a `RowDragStartDetail`:

```ts
export interface RowDragStartDetail {
  rowIds: string[];
}
```

### `dex-row-drag-end`

A drag of this table's rows ended, dropped or not. No detail.

`detail` is `null`.

### `dex-row-drop`

Rows were let go over a row the dropPredictor accepts (any row, with no predictor), or over
the space under the rows when it accepts that.

`detail` is a `RowDropDetail`:

```ts
export interface RowDropDetail {
  targetRowId: string;
  mode: DragMode;
}

export type DragMode = 'copy' | 'move';
```

### `dex-edit-text-request`

A Value editor is opening on a summary: send the whole text with openWholeValueEditor.

`detail` is a `EditTextRequestDetail`:

```ts
export interface EditTextRequestDetail {
  rowId: string;
}
```

### `dex-edit-completed`

A cell edit was committed with a text that differs from the one it had.

`detail` is a `EditCompletedDetail`:

```ts
export interface EditCompletedDetail {
  rowId: string;
  columnId: string;
  oldValue: string;
  newValue: string;
}
```

### `dex-link-clicked`

A link in a cell was clicked: any cell whose text names its `linkTarget` (a Data Type, Used
By, a block, a parameter).

`detail` is a `LinkClickedDetail`:

```ts
export interface LinkClickedDetail {
  target: string;
}
```

## Parts it defines

`defineTreeTable()` defines these first, under their default names, then `<dex-tree-table>`:

- [`<dex-add-gallery>`](add-gallery.md)
- [`<dex-column-filter>`](column-filter.md)
- [`<dex-filter-bar>`](filter-bar.md)
- [`<dex-icon>`](icon.md)
- [`<dex-matrix-open>`](matrix-open.md)

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-add-gallery-inset` | `8px` |  |
| `--dex-add-gallery-min-width` | `300px` |  |
| `--dex-bg-active` | `#e0e0e0` |  |
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-bg-primary` | `#fff` |  |
| `--dex-bg-secondary` | `#f8f8f8` |  |
| `--dex-bg-tertiary` | `#f5f5f5` |  |
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-border-color-active` | `#0078d4` | The border of a bar button whose popover is open (its surface is --dex-bg-active). |
| `--dex-border-color-light` | `#e0e0e0` |  |
| `--dex-border-color-ultralight` | `rgba(0, 0, 0, 0.05)` |  |
| `--dex-color-accent` | `#0078d4` |  |
| `--dex-color-accent-bg` | `#cde4f7` |  |
| `--dex-color-bg-na` | `rgba(127, 127, 127, 0.05)` | The wash over a cell the column does not apply to. Translucent, so it stays visible over a hovered or selected row. |
| `--dex-color-error` | `#d32f2f` |  |
| `--dex-color-modified` | `#b45309` | The Status column's "Modified". |
| `--dex-color-progress` | `#0078d4` | The table's loading spinner. |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-muted` | `#666` |  |
| `--dex-color-text-secondary` | `#555` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
| `--dex-frozen-shade` | `8px 0 6px -3px rgba(0, 0, 0, 0.28)` | The shade the table's columns slide under once the frozen Name column holds content back: one whole box-shadow layer (x, y, blur, spread, colour), with a spread of minus half the blur so the shade stays a band to the right of the column. |
| `--dex-row-height` | `28px` |  |
| `--dex-selection-fg` | `#333` | The ink on a selected row, whose surface is --dex-color-accent-bg. |
| `--dex-tooltip-bg` | `#f8f8f8` |  |
| `--dex-tooltip-border` | `#c8c8c8` |  |
| `--dex-tooltip-fg` | `#333` | The tooltip that follows the pointer while a row is dragged. |
