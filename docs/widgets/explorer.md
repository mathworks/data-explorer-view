# `<dex-explorer>`

The open files, as the app shell's Explorer lists them: Root first, the row for every open file
at once, then each kind of file under a heading of its own (Simulink Models, Data Dictionaries,
MAT-Files, Projects, Other, always in that order, and a heading only over files). A file with
sections has a twisty that opens it onto them (a dictionary's Design Data, Configurations, …),
and a file with unsaved changes reads ` *` after its name.

It draws what it is given and asks for the rest. A click on a row sends `dex-explorer-open` for
it, unpinned, for an app that shows it in a preview tab; a double-click or Enter sends it pinned;
a right-click on a file sends `dex-explorer-menu` with the point to open a menu at. Which row is
the current one is the app's: `selected` names the row highlighted, a click changes nothing of
it, and a `selected` that moves to a section of a closed file opens the file and scrolls the row
into view. The arrow keys walk the rows: Right opens a file or goes into it, Left closes it or
goes from a section back to its file, and Home and End go to the first and the last.

```js
import { defineExplorer } from 'data-explorer-view/app-shell';

defineExplorer();
const explorer = document.querySelector('dex-explorer');
explorer.files = [
  {
    id: uri, label: 'plant.sldd', group: 'sldd', icon: 'simulinkDataDictionary_FT', title: path, dirty: true,
    sections: [{ id: 'design', label: 'Design Data' }, { id: 'config', label: 'Configurations' }],
  },
];
explorer.selected = { fileId: uri }; // { fileId: null } is Root
explorer.addEventListener('dex-explorer-open', (e) => {
  const { fileId, sectionId, pin } = e.detail; // fileId null: Root
  show(fileId, sectionId, { preview: !pin });
});
explorer.addEventListener('dex-explorer-menu', (e) => {
  menu.show(e.detail.x, e.detail.y, fileItems(e.detail.fileId)); // a <dex-context-menu>
});
```

Which files are open onto their sections is the element's own, and a file that leaves `files` is
forgotten, so it comes back closed.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->
