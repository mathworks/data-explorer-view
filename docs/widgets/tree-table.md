# `<dex-tree-table>`

The table of a document: its sections, entries, variables or blocks as a tree, with a search
bar, columns the user sorts, resizes, reorders, hides and filters on, cell editors, row drag
and drop, links, the glyph that opens a matrix, and the `+ Add` gallery. It virtualises its
rows, so a dictionary of a hundred thousand entries scrolls as a small one does.

It holds no document. The app gives it rows and answers what it asks for; every user action
goes out as a `dex-*` event, and the table never changes the document itself. Its defaults are a
full editor: `readonly` makes it a viewer, `canAdd` and `rowDrag` turn the `+ Add` button and
dragging on and off. `keyboardMenu` gives the keyboard the row menu: Shift+F10 and the ContextMenu
key on the grid send `dex-table-context-menu` for the keyboard's row, placed under it, with
`keyboard: true`, and `connectTable` shows that menu with the keyboard on its first item, given
back to the grid as it closes (off by default, which leaves both keys to the browser, whose own
event names no row).

`connectTable` feeds it from a table source: a document opened in the page
(`createWorkspace().open(bytes, name)`), or a host across a channel (`messageSource(port)`). It
shows the source's view (rows, columns, headings, the banners above them), keeps the rows the
user opened, their selection and their search across a repaint, fetches the rows a paint held
back, opens the variable editor on a matrix glyph, selects the row a Data Type link names, and
gives a read-only context menu and Ctrl+F. What is the app's comes out of the handle it returns.

```js
import 'data-explorer-view/theme.css';
import { createWorkspace } from 'data-explorer-view/model';
import { connectTable, defineTreeTable } from 'data-explorer-view/tree-table';

defineTreeTable();
const table = document.createElement('dex-tree-table');
table.storageKey = 'my-app';     // this app's column choices; read when the table is connected,
table.readonly = true;           //   so set it before appending
document.body.append(table);

const doc = await createWorkspace().open(bytes, 'plant.sldd'); // core reads the file, in the page
const handle = connectTable(table, doc.table);
handle.on('select', (rowIds) => showProperties(rowIds)); // or connectInspector(inspector, handle)
handle.on('navigate', ({ link }) => openTarget(link)); // a row of another document, a file
```

Its options hand parts of that to the app. `variableEditor` is one editor for several tables
and an inspector. `menu: false` leaves the right-click to the app, and `menuItems` adds the
app's own items, whose choice comes out as `action`. `contextMenu` is a menu several tables
share: the table that opened it acts on its choice, and a dismissed menu leaves none waiting.
`banners` draws the banners somewhere else. `copy` puts what Copy Name and Copy Value copy on
the app's own clipboard instead of the page's; a copy that fails, on either, says so in the error
banner and as the handle's `copyFailed`. The handle's `painted` says each whole paint is drawn,
the first one too, with its view: what an app reads off the handle then (`view`, `can()`) is the
paint's, for a toolbar enabled as the file stands before any selection. `columns` narrows the
source's columns, on every paint, to those a list names or a test passes: to leave out one
nothing fills in this document.

```js
// No Usage column where no row has a usage to show.
connectTable(table, doc.table, { columns: (column, view) => column !== 'UsedBy' || view.rows.some((r) => r.UsedBy) });
```

`resolveLink` names the file a link opens, for an app that knows where the files a link names
are: it is asked first of every link but one into the table's own document, a uri it answers
goes out with `navigate` as `uri` (or, when it is this document, selects the link's entry here),
and null leaves the link to the table's own rule. A folder's hierarchy answers by the rule its
tree draws with, so a link to a dictionary a model names by its file name alone opens the copy
the tree shows under that model, wherever in the folder it is:

```js
const handle = connectTable(table, doc.table, { resolveLink: (link, fromUri) => hierarchy.resolveLink(link, fromUri) });
handle.on('navigate', ({ link, uri }) => openTarget(uri ?? link)); // uri: the file the tree shows
```

`editing` wires the table to edit through its source's commands (an `EditableTableSource`).
- **What is wired:** a committed cell edit is `edit`, a tile in the Add gallery `addEntry`, a row
  drag and drop `dragStart`, `drop` and `dragEnd`, and a Value editor opening on a summary
  `requestEditText`.
- **The menu and its chords:** the right-click menu is the editing one (Copy, Cut, Paste, Add
  Child, Delete, Undo, Redo), with its chords (Cmd/Ctrl+C, X and V, Delete), each enabled as its
  item is.
- **Undo and Redo:** a source that says where its undo stack stands (its `history`, which a
  workspace's documents have) gets each only where there is a step to take back or make again. A
  source that does not (a host's across a channel, whose stack is its editor's) gets both wherever
  the document may be edited.
- **What the source sends back:** a selection, a rename to begin, and the clipboard, drag and
  drop rules the menu and the drop predictor are built from. A refused edit opens the error
  dialog (`errorDialog`, or one connectTable makes).
- **What `editable` turns off:** the view's `editable` still decides. A read-only document gets
  no menu, no cell editor, no `+ Add` and no row drag, and connectTable sets `canAdd` and
  `rowDrag` from it. A source that takes no edits is read-only.
- **`textView`:** a plain-text view of the document. It adds Location in Text in its place in
  the menu, with Cmd/Ctrl+L.
- **A model's configuration sets:** the rows a model's source marks (`_canSetActive`) lead their
  menu with Set as Active Configuration, which is the source's `setActiveConfigSet`, and is greyed
  with the row's reason (`_setActiveWhy`) where the set is not made active; a reference's row says
  what making it active cannot check (`_setActiveCaution`), as the item's tooltip.
- **On the handle:** `toggleAddGallery()` is the `+ Add` button for an accelerator of the app's,
  and `menuFor(anchorRowId)` is the editing menu a right-click there would show. `ran` says each
  of the menu's gestures the source took, from the menu, a chord or `run()`: which item, the rows
  it carried and how many it acted on, a task later, and not where the source refused it, for an
  app's "Copied to clipboard" or "2 entries deleted".

```js
const handle = connectTable(table, messageSource(port), {
  editing: true,
  textView: { available: () => hasText, locate: (rowId) => revealInText(rowId) },
});
```

`inspectorPages` and `inspectorEditing` decide what an inspector following the handle
(connectInspector) is sent. Both are off by default, and the inspector shows the first selected
row's properties, read-only, and nothing for no row or a section heading.
- **`inspectorPages`:** the file's own page while no row is selected, a section heading's, "3
  selected" for several rows, and a row's Usage links as a group of their own.
- **`inspectorEditing`, with `editing`:** rows are editable where the document may be edited and
  takes an edit of the property. A change of one comes back through `handle.edit()`, which writes
  it as a cell edit is: a refusal opens the error dialog, and the page is sent again so the field
  shows what the document holds. `commitEdit()` waits for it.
- **`handle.refreshInspector()`:** asks for the page again, for a change the table does not hear
  of. The file's page says whether the document holds edits: call it whenever that changes (the
  document's `onDirty`, a save among them). A page that is the one last sent is not sent again.

```js
const handle = connectTable(table, doc.table, { editing: true, inspectorPages: true, inspectorEditing: true });
connectInspector(inspector, handle);
doc.onDirty(() => handle.refreshInspector());
```

### Comparing

Two tables given the same row ids, in the same order and tree, stay line by line beside each
other: a compare's two files, with a blank row on a side where its file lacks the line. `diffMarks`
marks each line on a side (added, removed, changed with the columns that differ, or a gap): a bar
at the row's left edge, a wash, a glyph before the name with the word for a screen reader, and in
forced colours an outline round each differing cell. A gap row has no twisty and no
`aria-expanded`, and Space opens nothing on it: the gaps under it show and hide as the holder opens
and closes the other side's row, through `expandedIds`. A section's row counts its file's entries:
its `_entryCount` where it has one (a compare's heading, whose lines leave some entries out and hold
the other file's gaps), and on a gap heading no count. The two tables select the same line, and
only the one with the keyboard rings its focused cell. `fixedRows` keeps the rows as given, as a
sort or a search on one side alone would break the lines: a header press sorts nothing, and there
is no search box and no column filter. To keep the two together, each table says what it did of
itself: `dex-expansion-changed` (not for `expandedIds`, `expand()` or `collapse()`, which a holder
copying one table's expansion onto the other uses, so nothing echoes) and `dex-table-scrolled`,
with `bodyScroll` and `scrollBodyTo(top, left)` to read and set the other's. `gridLabel` names each
grid for a screen reader. [`<dex-compare-view>`](compare-view.md) holds two tables this way.

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

type `TreeTableRow[]` · default `[]` · property only

The rows, flat: each names its parent by `ID` (`parent`, null at the top level), and
siblings show in the order given until the user sorts. What the model's planner makes of a
document, `rowPlannerFor(name).payload(node, LAZY_ROW_BUDGET).rows`, which holds back the
children of rows past the budget (`_lazy`) for `dex-request-children` to fetch. Default none.
Property only.

### `selectedRowIds`

type `string[]` · default `[]` · property only

The ids of the selected rows. The table changes it as the user selects, and says so with
`dex-row-selected`; setting it sends nothing. Default none. Property only.

### `tableStyle`

type `'normal' | 'light'` · default `'normal'` · attribute `table-style`, reflected

`normal`, the default, rules every cell; `light` drops the lines between columns and keeps a
faint one between rows. Reflected to the attribute `table-style`.

### `columnLabels`

type `Record<string, string> | null` · default `null` · property only

Each column's header text, by column key (`{ DataType: 'Data Type' }`), also the name a
search may qualify a term with (`"Data Type":double`); a column with none shows its key.
Default null. Property only.

### `columnGroups`

type `Record<string, string> | null` · default `null` · property only

The group heading each column sits under in the Columns menu, by column key. Default null:
no headings. Property only.

### `columns`

type `string[] | null` · default `null` · property only

The column keys this document has, which the Columns menu offers; the user's saved order and
choice of hidden ones apply within them. Default null: the built-in set. Property only.

### `banners`

type `TableBanners | null` · default `null` · property only

The banners drawn above the search bar: an error, a notice, and what the document's read
could not read (TableBanners), each when present. connectTable sets it from what its source
says. Default null: none. Property only.

### `loading`

type `boolean` · default `false` · attribute `loading`

The rows are on their way: while there are none, the table says Loading… (with a spinner,
after half a second) instead of "No data"; the search bar stays. Set it while a document is
read. Default false. Attribute `loading`.

### `canAdd`

type `boolean` · default `false` · attribute `can-add`

Whether this view can create entries, i.e. whether the `+ Add` button (and its gallery,
whose tiles send `dex-add-entry`) exists at all. Default false. Attribute `can-add`.

### `addClasses`

type `readonly string[] | null` · default `null` · property only

The classes a MAT-file's gallery offers, as core lists the classes a MAT-file can hold, or
null, the default, for a dictionary's gallery, which offers every tile. The gallery draws the
tiles of these classes only (the model's matCatalog). Property only.

### `addSections`

type `readonly string[] | null` · default `null` · property only

With `addClasses`, the sections beside the file's variables whose every tile its gallery
offers too, each tile naming its section: a model's configuration sets, `config`. Null, the
default: none. Property only.

### `rowDrag`

type `boolean` · default `true` · attribute `row-drag`

Whether a row can be dragged, or a dragged row let go over one. Set it false where the
document cannot be changed: no row is draggable, and a drag from another table draws no drop
target here, on a row or on the empty body. Default true. Attribute `row-drag`.

### `dragOut`

type `boolean` · default `false` · attribute `drag-out`

Whether rows are dragged out of the table, onto another part of the page that takes them (the
app shell's Explorer, onto an open file). Where the table takes no row drag of its own
(`rowDrag` false, or `readonly`) its rows can still be dragged out then, as a copy alone: the
drag allows no move, so the document never loses an entry by it, and no row of this table takes
a drop. And while a row drag of this table's is on, the box at the pointer (the dragged row's
icon and name) follows the pointer over the rest of the page too, until the drag is let go
anywhere, saying there what the part under the pointer says a drop would do: the words of the
nearest element under it with a `data-drop-hint` attribute (an Explorer row the drag is over),
as a refusal where that element has `data-drop-refused` too; nothing where none has. Default
false: a table that takes no row drag drags none, and the box stays over the table. Attribute
`drag-out`.

### `readonly`

type `boolean` · default `false` · attribute `readonly`, reflected

A viewer: the user selects, opens, searches, sorts, filters and copies, and changes nothing.
No cell editor opens — not on a double-click, not on Enter, not for beginRename or
openWholeValueEditor — and no cell is drawn as editable; the `+ Add` button is not drawn
whatever canAdd says, and no row is dragged or takes a drop whatever rowDrag says (with
`dragOut`, a row is still dragged out, to be copied). So none of the events those gestures send
(dex-edit-completed, dex-edit-text-request, dex-add-entry, dex-row-drag-start, dex-row-drop) is
sent, but dex-row-drag-start for a row dragged out. A right-click still sends dex-table-context-menu:
what a read-only menu offers is the app's to say (buildContextMenuItems with editable false).
False, the default, is the table as it always was, each cell's own flags deciding. Reflected
to the attribute `readonly`.

### `keyboardMenu`

type `boolean` · default `false` · attribute `keyboard-menu`

Whether Shift+F10 and the ContextMenu key, pressed on the grid, open the row menu: they send
`dex-table-context-menu` for the keyboard's current row (the row the arrows last moved to, else
the selection's last, whichever the table shows), placed under that row as a right-click on it
is, with `keyboard: true` (connectTable then gives the menu the keyboard); with no such row, for
the space under the rows. Both keys are spent, so the browser's own menu event for them does
not follow, and the grid names them (`aria-keyshortcuts`). A field's keys stay the field's (a
cell editor, a header's filter button). False, the default, leaves both keys to the browser, as
they always were. Attribute `keyboard-menu`.

### `diffMarks`

type `ReadonlyMap<string, DiffMark> | null` · default `null` · property only

Each row's compare mark, by row id: a bar at the row's left edge and a wash in its kind's colour,
a glyph before its name (+ added, − removed, ~ changed) with the word for a screen reader, the
differing cells washed deeper, and a gap row hatched, with no twisty (it opens nothing; the gaps
under it follow `expandedIds`). The focused cell is ringed only while the table has the
keyboard: a compare's other table selects the same line. Default null: no marks, the table as
it always was. Property only.

### `fixedRows`

type `boolean` · default `false` · attribute `fixed-rows`, reflected

The rows as given, in their order, all of them: a header press sorts nothing and draws no sort
mark, and there is no search box and no column filter (the Columns button stays). For two tables
kept line by line beside each other, a compare's. Default false. Reflected to `fixed-rows`.

### `gridLabel`

type `string` · default `'Data entries'` · attribute `grid-label`

What a screen reader calls the grid. Default 'Data entries'. Attribute `grid-label`.

### `bodyScroll`

type `{ top: number; left: number }` · read-only

Where the rows are scrolled to now, in pixels (the grid's own scroll position).

### `storageKey`

type `string | null` · default `'dex'` · attribute `storage-key`

Where the user's column choices (which are shown, and their order) are kept: the page's
localStorage, under `<storageKey>-column-order`, `<storageKey>-hidden-columns` and
`<storageKey>-known-columns`. The default, 'dex', is the keys every table has always used,
so a layout saved before this existed carries over — and every table on the page that keeps
the default shares one layout. An app gives each kind of table a key of its own, or null
(or '') to keep the choices for this element's life only, with localStorage never touched.
They are read when the table is connected, so set it before the table goes into the page: a
key set later reads them again, from that key, after the table has shown the ones under the
key it had. Attribute `storage-key`.

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

Predicts a drop for the row under the cursor ('' for the space under the rows), as the
dragover goes: whether it may drop, the cursor and the tooltip to show, and whether it would
change nothing. The app sets it, from the model's dropDecision and what it knows is being
dragged (a drag can come from another table). Returns null when it cannot predict — no drag
it was told about, or a target with no rule — and null REFUSES: with a predictor, "cannot
say" is not "yes". With none, the default, any row takes a drop and the space under the rows
takes none. Property only.

## Methods

### `scrollBodyTo(top: number, left?: number): void`

Scroll the rows to `top`, and across to `left` where given, as the user would: `dex-table-scrolled` follows.

### `focusGrid(): void`

Give the keyboard to the grid, as a click on its rows does: the arrows then move over the rows,
and the menu keys open a row's menu. An empty table's body takes it where there are no rows.
Nothing while the table is loading. Called before the table is drawn, once it is.

### `expand(ids: Iterable<string>): void`

Opens these rows as a click on each one's twisty does: a row with nothing under it stays
closed, and a row whose children the payload held back (`_lazy`) asks for them once
(dex-request-children). Read off `rows` as they are now, so it may follow an assignment of
them directly.

### `collapse(ids: Iterable<string>): void`

Closes these rows.

### `toggleAddGallery(): void`

Opens the `+ Add` gallery under the Add button, or closes it if it is open, as a click on the
button does: an app's keyboard shortcut for adding an entry. It opens nothing while the button
is not drawn (`canAdd` false, or `readonly`).

### `beginRename(rowId: string): boolean`

Opens the Name editor on a row, as a double-click on its Name does: what an app calls after
adding an entry the user should name (`dex-add-entry`'s `rename`). The edit comes back as
`dex-edit-completed`. Returns whether the editor opened: false when the row is not in `rows`
yet, so an app can call again once it is, or when its Name cannot be edited.

### `openWholeValueEditor(rowId: string, text: string): void`

The answer to `dex-edit-text-request`: opens the Value editor of `rowId` on `text`, the whole
value the cell's summary stands for. In a textarea, as the text can be one long line of up to
200,000 characters; committed unchanged it sends nothing, and changed it sends
`dex-edit-completed` with the whole text. Only the answer to the last request opens an
editor, and only while no other editor is open and the cell still takes this one: an answer
that arrives after the user moved on opens nothing.

### `commitEdit(): boolean`

Commits the cell editor open now, if any, as Enter would: its edit comes back as
`dex-edit-completed` when the text changed, and the keyboard goes back to the table. Returns
whether an editor was open. For a host that saves or closes the document while an edit is still
being typed.

### `focusFilter(): void`

Focuses (and selects) the search input: an app's Ctrl+F.

### `flashRow(rowId: string): void`

Flashes a row's background once, on the next render, as a copy does; nothing if it is not drawn.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-add-entry`

A tile of the `+ Add` gallery was clicked: add one entry of that class, renaming it if `rename`.

`detail` is a `AddEntryDetail`:

```ts
/** What `dex-add-entry` carries: the tile's class, section and label, and whether to rename the row. */
export interface AddEntryDetail extends AddTileDetail {
  rename: boolean;
}

/**
 * What `dex-add-tile` carries: the tile's class, its section ('' for a MAT-file's variable; a
 * section of the file's own, `sections`, by its key) and its label.
 */
export interface AddTileDetail {
  className: string;
  section: string;
  label: string;
}
```

### `dex-expansion-changed`

The rows shown open changed, by the user or by the table itself (a twisty, a key, a selection
whose parents it opened, `expandTopLevel`): not by `expandedIds`, `expand()` or `collapse()`.

`detail` is a `ExpansionChangedDetail`:

```ts
/** What `dex-expansion-changed` carries: every row shown open now. */
export interface ExpansionChangedDetail {
  expandedIds: string[];
}
```

### `dex-table-scrolled`

The rows were scrolled, by the user or by the table (a row brought into view, `scrollBodyTo`).

`detail` is a `TableScrolledDetail`:

```ts
/** What `dex-table-scrolled` carries: where the rows are scrolled to, in pixels. */
export interface TableScrolledDetail {
  top: number;
  left: number;
}
```

### `dex-request-children`

A row whose children the payload held back (`_lazy`) was opened: answer with its rows,
merged into `rows` under it (connectTable asks its source's `children` and merges them in
place). Asked once until its rows arrive.

`detail` is a `RequestChildrenDetail`:

```ts
/** What `dex-request-children` carries: the row whose children the payload held back. */
export interface RequestChildrenDetail {
  nodeId: string;
}
```

### `dex-table-context-menu`

A right-click on a row (after selecting it) or on the space under the rows, or with
`keyboardMenu` Shift+F10 or the ContextMenu key on the grid, for the keyboard's row: open a
context menu there.

`detail` is a `TableContextMenuDetail`:

```ts
/**
 * What `dex-table-context-menu` carries: where to open the menu (viewport pixels), the row
 * right-clicked (null for the space under the rows), and, for a model's block row, the model the
 * row's `_graphTarget` names.
 */
export interface TableContextMenuDetail {
  x: number;
  y: number;
  rowId: string | null;
  graphTarget?: string;
  /**
   * A key opened it (`keyboardMenu`), not a right-click: the menu is to take the keyboard at once,
   * and give it back to the grid when it closes (the context menu's `focusFirst`). Absent for a
   * right-click.
   */
  keyboard?: true;
}
```

### `dex-row-selected`

The user changed the selection: a click, Ctrl/Cmd- or Shift-click, a key, select-all, or a
right-click on a row not in it.

`detail` is a `RowSelectedDetail`:

```ts
/** What `dex-row-selected` carries: the selection, as `selectedRowIds` now holds it. */
export interface RowSelectedDetail {
  rowIds: string[];
}
```

### `dex-row-drag-start`

The user started dragging rows.

`detail` is a `RowDragStartDetail`:

```ts
/**
 * What `dex-row-drag-start` carries: the rows dragged — the selection when the row grabbed is in
 * it, else that row alone — less any section header.
 */
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
/** What `dex-row-drop` carries: the row let go on ('' for the space under the rows), and copy or move. */
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
/** What `dex-edit-text-request` carries: the row whose whole Value text the editor needs. */
export interface EditTextRequestDetail {
  rowId: string;
}
```

### `dex-edit-completed`

A cell edit was committed with a text that differs from the one it had.

`detail` is a `EditCompletedDetail`:

```ts
/** What `dex-edit-completed` carries: the cell, the text it had and the text typed. */
export interface EditCompletedDetail {
  rowId: string;
  columnId: string;
  oldValue: string;
  newValue: string;
}
```

### `dex-link-clicked`

A link in a cell was clicked: a Data Type, Used By, a block or a parameter. `target` says
what it points at; see LinkClickedDetail for its forms.

`detail` is a `LinkClickedDetail`:

```ts
/**
 * What `dex-link-clicked` carries: the `linkTarget` of the link clicked, as core and the row
 * builders write it. A target is one of:
 *
 * - `<name>@<source>`: the entry or variable `<name>` in the document `<source>`. A Data Type
 *   link names one in the same document, a Used By link or a block's parameter link one
 *   anywhere;
 * - `blocks:<block>@<source>`: a block of the model `<source>` that uses this row's variable,
 *   by its SID (by its name in a file older than SIDs);
 * - `workspace:<name>@<source>`: a parameter in the model workspace of `<source>`;
 * - `<file>`, with no `@`: a file to open (a Model Reference or External Data link), with no row
 *   in it to select.
 *
 * Split at the first `@`, as core does, but for a block target: a pre-SID block's name can hold
 * one, so it splits at the first `@` that a uri follows, else at the last. A source can contain
 * one. `<source>` is a core source id, the file's URL (the model's
 * srcIdToUriString turns any source id into one), or a bare file name where the file recorded
 * only that. `parseLinkTarget` (`data-explorer-view/model`) reads one.
 */
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
| `--dex-diff-added` | `#2e7d32` | A compare's marks (dex-tree-table's `diffMarks`): each kind's bar at a row's left edge (3:1 against the rows), its wash, a differing cell's deeper wash, and a gap row's hatching. |
| `--dex-diff-added-bg` | `rgba(46, 125, 50, 0.1)` |  |
| `--dex-diff-cell-bg` | `rgba(180, 83, 9, 0.2)` |  |
| `--dex-diff-changed` | `#b45309` |  |
| `--dex-diff-changed-bg` | `rgba(180, 83, 9, 0.08)` |  |
| `--dex-diff-gap-stripe` | `rgba(0, 0, 0, 0.1)` |  |
| `--dex-diff-removed` | `#c62828` |  |
| `--dex-diff-removed-bg` | `rgba(198, 40, 40, 0.09)` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
| `--dex-font-mono` | `'SF Mono', 'Menlo', 'Monaco', monospace` |  |
| `--dex-frozen-shade` | `8px 0 6px -3px rgba(0, 0, 0, 0.28)` | The shade the table's columns slide under once the frozen Name column holds content back: one whole box-shadow layer (x, y, blur, spread, colour), with a spread of minus half the blur so the shade stays a band to the right of the column. |
| `--dex-row-height` | `28px` |  |
| `--dex-selection-fg` | `#333` | The ink on a selected row, whose surface is --dex-color-accent-bg. |
| `--dex-tooltip-bg` | `#f8f8f8` |  |
| `--dex-tooltip-border` | `#c8c8c8` |  |
| `--dex-tooltip-fg` | `#333` | The tooltip that follows the pointer while a row is dragged. |
| `--dex-warning-bg` | `rgba(255, 190, 60, 0.12)` |  |
| `--dex-warning-border` | `#b89500` |  |
| `--dex-warning-fg` | `#333` | A "this file did not read whole" notice. |
