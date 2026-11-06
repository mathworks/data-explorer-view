# `<dex-gallery-panel>`

The app shell's Gallery: the [Add gallery](add-gallery.md)'s tiles as a palette that is always
open in a sidebar, under a heading that names the file an add lands in ("Add to plant.sldd"). A
click on a tile sends `dex-gallery-add` with its class and section, for the app to add one entry
of it to the active file; the panel adds nothing itself.

What it offers is the Add gallery's: every tile of a dictionary by default, or, with `classes`, a
MAT-file's or a model workspace's classes (and the tiles of the `sections` beside them, a model's
configurations). While `disabled` (nothing open, or a project), a note says what to open, and the
tiles are shown faded and take no press.

```js
import { defineGalleryPanel } from 'data-explorer-view/app-shell';

defineGalleryPanel(); // and the <dex-add-gallery> it draws
const gallery = document.querySelector('dex-gallery-panel');

function follow(tab) { // as the active tab changes
  const view = tab?.handle?.view; // the TableView connectTable last painted
  gallery.target = tab?.name ?? '';
  gallery.disabled = !tab?.doc?.editable;
  gallery.classes = view?.add?.classes ?? null;
  gallery.sections = view?.addSections ?? null;
}
gallery.addEventListener('dex-gallery-add', (e) => {
  const { className, section } = e.detail;
  activeDoc.table.addEntry({ className, section, rename: true }); // an EditableTableSource
});
```

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->
