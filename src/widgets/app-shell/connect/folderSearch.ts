// Copyright 2026 The MathWorks, Inc.
//
// The search over the shown folder's entry names: a box above its tree, and while it holds a
// query, the matches in place of the tree. Picking one opens its file on that row.
//
// Lifted from data-explorer-app src/renderer/ui/search.ts at 0983920. The box and the list are
// <dex-shell-folder>'s, in its shadow root, which styles the results this draws there; and the
// handle can be disposed, since the shell that installed it can be taken down.

import { searchEntries, sortNameRecords } from '../../../model/search/searchItems.js';
import type { NameIndex } from '../../../model/search/nameIndex.js';
import type { DexIcon } from '../../shared/dex-icon.js';

type Records = Awaited<ReturnType<NameIndex['list']>>;

export interface SearchHandle {
  /** The folder's names changed (another folder, or a change in it): read them again when asked. */
  reset(): void;
  /** Stop listening to the box. */
  dispose(): void;
}

export function installSearch(
  input: HTMLInputElement,
  results: HTMLElement,
  tree: HTMLElement,
  names: () => NameIndex | undefined,
  pick: (uri: string, revealName: string) => void,
): SearchHandle {
  let records: Promise<Records> | null = null;
  let asked = 0;

  async function show(): Promise<void> {
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
    if (ask !== asked) return;
    results.replaceChildren(
      ...(items.length === 0 ? [Object.assign(document.createElement('li'), { className: 'search-none', textContent: 'No matches' })] : []),
      ...items.map((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'search-result';
        button.title = item.description;
        const icon = document.createElement('dex-icon') as DexIcon;
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
      }),
    );
  }

  const onInput = () => void show();
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      input.value = '';
      void show();
    } else if (e.key === 'Enter') {
      results.querySelector<HTMLButtonElement>('.search-result')?.click();
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
