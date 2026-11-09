// Copyright 2026 The MathWorks, Inc.
//
// The search over the shown folder's entry names: a box above its tree, and while it holds a
// query, the matches in place of the tree. Picking one opens its file on that row.
//
// Lifted from data-explorer-app src/renderer/ui/search.ts at 0983920. The box and the list are
// <dex-shell-folder>'s, in its shadow root, which styles the results this draws there; and the
// handle can be disposed, since the shell that installed it can be taken down.
import { searchEntries, sortNameRecords } from '../../../model/search/searchItems.js';
/**
 * Search the names `names` gives (the folder shown's) as `input` is typed in: the matches in
 * `results`, in place of `tree` while there is a query; a match clicked, or the first on Enter,
 * goes to `pick` with its file's uri and the name to select there. Escape empties the box.
 */
export function installSearch(input, results, tree, names, pick) {
    let records = null;
    let asked = 0;
    async function show() {
        const ask = ++asked;
        const query = input.value.trim();
        const index = names();
        results.hidden = query === '' || !index;
        tree.hidden = !results.hidden;
        if (results.hidden || !index) {
            results.replaceChildren();
            return;
        }
        records ??= index.list().then(sortNameRecords);
        const items = searchEntries(await records, query, 100);
        if (ask !== asked)
            return;
        results.replaceChildren(...(items.length === 0 ? [Object.assign(document.createElement('li'), { className: 'search-none', textContent: 'No matches' })] : []), ...items.map((item) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'search-result';
            button.title = item.description;
            const icon = document.createElement('dex-icon');
            icon.iconId = item.iconId;
            const label = document.createElement('span');
            label.className = 'search-label';
            label.textContent = item.label;
            const where = document.createElement('span');
            where.className = 'search-where';
            where.textContent = item.description;
            button.append(icon, label, where);
            button.addEventListener('click', () => pick(item.entry.sourceUri, item.revealName));
            const li = document.createElement('li');
            li.append(button);
            return li;
        }));
    }
    const onInput = () => void show();
    const onKeydown = (e) => {
        if (e.key === 'Escape') {
            input.value = '';
            void show();
        }
        else if (e.key === 'Enter') {
            results.querySelector('.search-result')?.click();
        }
    };
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeydown);
    return {
        reset() {
            records = null;
            void show();
        },
        dispose() {
            // Whatever a search still out comes back to is not drawn: it is not the last one asked.
            asked++;
            input.removeEventListener('input', onInput);
            input.removeEventListener('keydown', onKeydown);
        },
    };
}
