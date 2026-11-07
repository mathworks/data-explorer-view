// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// `<dex-hierarchy multi-select>`: a folder tree whose rows can be taken into the selection one by
// one, Cmd+click on macOS or Ctrl+click elsewhere, without opening any of them, so an app can act on
// several files at once (the Folder view's Compare Selected). A plain click and Enter still select
// one row and send what they always sent. Without `multiSelect` the tree is as it always was: a
// Cmd/Ctrl+click is a click, and nothing new is said. A screen reader hears the tree as
// multi-selectable, and each row's selection, only with it.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  defineHierarchy,
  type DexHierarchy,
  type HierarchyItem,
  type HierarchySelectionChangedDetail,
} from '../src/widgets/hierarchy/index.js';

beforeAll(() => defineHierarchy());
afterEach(() => {
  document.body.replaceChildren();
  Reflect.deleteProperty(navigator, 'platform');
});

const item = (key: string, label: string, more: Partial<HierarchyItem> = {}): HierarchyItem => ({ label, kind: 'sldd', collapsible: 'none', key, ...more });
const A = item('/w/a', 'a.sldd', { id: 'file:///w/a.sldd' });
const B = item('/w/b', 'b.sldd', { id: 'file:///w/b.sldd' });
const C = item('/w/c', 'c.sldd', { id: 'file:///w/c.sldd' });

async function settle(el: DexHierarchy): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await el.updateComplete;
  }
}

async function tree(multi: boolean): Promise<DexHierarchy> {
  Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
  const el = document.createElement('dex-hierarchy');
  el.multiSelect = multi;
  el.items = [A, B, C];
  document.body.append(el);
  await settle(el);
  return el;
}

const rowOf = (el: DexHierarchy, label: string): HTMLElement =>
  [...el.shadowRoot!.querySelectorAll<HTMLElement>('[role="treeitem"]')].find((r) => r.querySelector('.label')!.textContent === label)!;
const selected = (el: DexHierarchy): string[] =>
  [...el.shadowRoot!.querySelectorAll<HTMLElement>('[role="treeitem"][aria-selected="true"]')].map((r) => r.querySelector('.label')!.textContent!);
const click = (el: DexHierarchy, label: string, mod = false): void =>
  void rowOf(el, label).dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, ctrlKey: mod }));
const heard = <T,>(el: DexHierarchy, name: string): T[] => {
  const out: T[] = [];
  el.addEventListener(name, (e) => void out.push((e as CustomEvent<T>).detail));
  return out;
};

describe('a tree of several selected rows', () => {
  it('takes rows into the selection by Ctrl+click, opening none of them', async () => {
    const el = await tree(true);
    const changes = heard<HierarchySelectionChangedDetail>(el, 'dex-hierarchy-selection-changed');
    const chosen = heard<unknown>(el, 'dex-hierarchy-selected');
    click(el, 'a.sldd', true);
    click(el, 'c.sldd', true);
    await settle(el);
    expect(selected(el)).toEqual(['a.sldd', 'c.sldd']);
    expect(el.selectedKeys).toEqual(['/w/a', '/w/c']);
    expect(el.selectedKey).toBe('/w/c');
    expect(changes).toHaveLength(2);
    expect(changes[1]!.keys).toEqual(['/w/a', '/w/c']);
    expect(changes[1]!.items.map((i) => i.label)).toEqual(['a.sldd', 'c.sldd']);
    expect(chosen).toEqual([]);
    expect(el.selectedItems.map((i) => i.label)).toEqual(['a.sldd', 'c.sldd']);
  });

  it("takes a selected row out by Ctrl+click", async () => {
    const el = await tree(true);
    click(el, 'a.sldd', true);
    click(el, 'b.sldd', true);
    click(el, 'a.sldd', true);
    await settle(el);
    expect(selected(el)).toEqual(['b.sldd']);
    expect(el.selectedKeys).toEqual(['/w/b']);
  });

  it('selects one row with a plain click or Enter, as it always did', async () => {
    const el = await tree(true);
    const changes = heard<HierarchySelectionChangedDetail>(el, 'dex-hierarchy-selection-changed');
    const chosen = heard<{ key: string }>(el, 'dex-hierarchy-selected');
    click(el, 'a.sldd', true);
    click(el, 'b.sldd', true);
    click(el, 'c.sldd');
    await settle(el);
    expect(selected(el)).toEqual(['c.sldd']);
    expect(el.selectedKeys).toEqual(['/w/c']);
    expect(chosen.map((d) => d.key)).toEqual(['/w/c']);
    expect(changes.at(-1)!.keys).toEqual(['/w/c']);
    rowOf(el, 'a.sldd').focus();
    rowOf(el, 'a.sldd').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    await settle(el);
    expect(selected(el)).toEqual(['a.sldd']);
    expect(chosen.map((d) => d.key)).toEqual(['/w/c', '/w/a']);
  });

  it('is told as one that selects several, only with multiSelect', async () => {
    const multi = await tree(true);
    expect(multi.shadowRoot!.querySelector('[role="tree"]')!.getAttribute('aria-multiselectable')).toBe('true');
    document.body.replaceChildren();
    const single = await tree(false);
    expect(single.shadowRoot!.querySelector('[role="tree"]')!.hasAttribute('aria-multiselectable')).toBe(false);
  });

  it('takes a Ctrl+click for a click without it, and says nothing new', async () => {
    const el = await tree(false);
    const changes = heard<unknown>(el, 'dex-hierarchy-selection-changed');
    const chosen = heard<{ key: string }>(el, 'dex-hierarchy-selected');
    click(el, 'a.sldd', true);
    click(el, 'b.sldd', true);
    await settle(el);
    expect(selected(el)).toEqual(['b.sldd']);
    expect(chosen.map((d) => d.key)).toEqual(['/w/a', '/w/b']);
    expect(changes).toEqual([]);
  });

  it("uses Cmd on macOS, where a Ctrl+click is a click", async () => {
    const el = await tree(true);
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
    const chosen = heard<{ key: string }>(el, 'dex-hierarchy-selected');
    rowOf(el, 'a.sldd').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, metaKey: true }));
    rowOf(el, 'b.sldd').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, metaKey: true }));
    await settle(el);
    expect(selected(el)).toEqual(['a.sldd', 'b.sldd']);
    expect(chosen).toEqual([]);
    rowOf(el, 'c.sldd').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, ctrlKey: true }));
    await settle(el);
    expect(selected(el)).toEqual(['c.sldd']);
  });

  it('keeps the row the app reveals as the one selected', async () => {
    const el = await tree(true);
    click(el, 'a.sldd', true);
    click(el, 'b.sldd', true);
    el.revealRow([C]);
    await settle(el);
    expect(selected(el)).toEqual(['c.sldd']);
    expect(el.selectedKeys).toEqual(['/w/c']);
  });
});
