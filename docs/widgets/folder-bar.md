# `<dex-folder-bar>`

The top row of a folder view: ↑, the path of the folder shown as segments, outermost first
(/ › Users › delite › complex_dataflow), then ⟳ and ⋯. The last segment is the folder shown, and
is not a button. The bar works out no path and moves nowhere itself. Each press is a request:
`dex-folder-up`, `dex-folder-go` with the folder a segment stands for, `dex-folder-refresh`, and
`dex-folder-menu`, which asks the app to show its menu. The app moves (re-roots), then gives the
bar the new segments. It says by `canUp` whether there is a folder above, and by `refresh` what ⟳
is. The bar sits beside the [location bar](location-bar.md) in spirit, and looks like it.

```js
import { defineFolderBar } from 'data-explorer-view/app-shell';

defineFolderBar();
const bar = document.querySelector('dex-folder-bar');
bar.segments = [
  { label: '/', path: '/' },
  { label: 'Users', path: '/Users' },
  { label: 'delite', path: '/Users/delite' },
  { label: 'complex_dataflow', path: '/Users/delite/complex_dataflow' },
];
bar.canUp = true;
bar.addEventListener('dex-folder-up', () => reroot(parentOf(root)));
bar.addEventListener('dex-folder-go', (e) => reroot(e.detail.path));
bar.addEventListener('dex-folder-refresh', () => readAgain());
bar.addEventListener('dex-folder-menu', (e) => {
  // e.detail.anchor: the button's box. e.detail.segments: the folders a `…` holds, when it was that.
  showMenu(e.detail.anchor, e.detail.segments);
});

async function reroot(path) {
  bar.busy = true; // ↑, the segments and ⟳ wait; ⋯ stays usable
  try {
    if (await host.openFolderAt(path)) bar.segments = segmentsOf(path);
  } finally {
    bar.busy = false;
  }
}
```

`refresh` is `read` (Read Again, the default), `pick` (Pick Again, for a folder the host can
only ask the user for again, such as a browser's snapshot of a folder) or `none` (no ⟳). Either
button sends `dex-folder-refresh`.

A path too long for the bar folds the folders after the first into a `…` button, and keeps as
many of the last ones as fit. If the first folder does not fit beside the current one, it is
folded too. The `…` sends `dex-folder-menu` with the folders it holds, so the app can list them.
If the current folder alone does not fit, its name ends in an ellipsis. Each segment's tooltip is
its folder's path.

Every button is a tab stop, a disabled one included. Alt+↑ (⌥↑ on a Mac) anywhere in the bar is
↑. The bar takes that press for itself even when ↑ cannot be used, so it never reaches a
listener of the page's. `mono` draws the icons of ↑, ⟳ and ⋯ in the text's colour.
