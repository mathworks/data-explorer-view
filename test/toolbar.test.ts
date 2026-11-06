// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// <dex-toolbar>: the app shell's first row, the buttons an app hands it (Open, Save, Undo, Cut, …)
// in groups, with the end groups pushed to the right, and what a click or the keyboard does with
// them. The toolbar knows nothing of files or tables: what it promises is the layout of the items
// it was given, the tooltip each one shows, that only an item that is not disabled sends
// `dex-toolbar-action`, and that the keyboard reaches every item as one tab stop (the WAI-ARIA toolbar
// pattern). Over hand-made items laid out as the prototype's toolbar is, so a case reads as the
// row the user sees.
//
// happy-dom applies no stylesheet and gives a <button> no keyboard activation, so the look (sizes,
// the compact row, the grey of a disabled item) is pinned by what the markup says (the icon's size,
// the reflected attribute, aria-disabled), and Enter and Space by what the platform needs to do it
// itself: a native <button> whose keydown the toolbar leaves alone.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DexToolbar, defineToolbar, type ToolbarActionDetail, type ToolbarItem } from '../src/widgets/app-shell/dex-toolbar.js';
import { DexIcon } from '../src/widgets/shared/dex-icon.js';

beforeAll(() => defineToolbar());
afterEach(() => document.body.replaceChildren());

// the prototype's row: Open, Folder | Save, Save As, Save All | Close on the left, and
// Undo, Redo | Add Child | Cut, Copy, Paste | Delete on the right.
const TS_ROW: ToolbarItem[] = [
  { id: 'open', label: 'Open', icon: 'openFolder', group: 'open', shortcut: '⌘O' },
  { id: 'folder', label: 'Folder', icon: 'folder', group: 'open' },
  { id: 'save', label: 'Save', icon: 'saved', group: 'save', shortcut: '⌘S' },
  { id: 'saveAs', label: 'Save As', icon: 'saveAs', group: 'save' },
  { id: 'saveAll', label: 'Save All', icon: 'save_all', group: 'save' },
  { id: 'close', label: 'Close', icon: 'close', group: 'close' },
  { id: 'undo', label: 'Undo', icon: 'undo', group: 'history', align: 'end', disabled: true },
  { id: 'redo', label: 'Redo', icon: 'redo', group: 'history', align: 'end', disabled: true },
  { id: 'addChild', label: 'Add Child', icon: 'addBlockChild', group: 'add', align: 'end' },
  { id: 'cut', label: 'Cut', icon: 'cut', group: 'clipboard', align: 'end' },
  { id: 'copy', label: 'Copy', icon: 'copy', group: 'clipboard', align: 'end' },
  { id: 'paste', label: 'Paste', icon: 'paste', group: 'clipboard', align: 'end' },
  { id: 'delete', label: 'Delete', icon: 'delete', group: 'delete', align: 'end' },
];

async function toolbar(items: ToolbarItem[], init: (el: DexToolbar) => void = () => {}): Promise<DexToolbar> {
  const el = document.createElement('dex-toolbar');
  el.items = items;
  init(el);
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const bar = (el: DexToolbar): HTMLElement => el.shadowRoot!.querySelector<HTMLElement>('[role="toolbar"]')!;
const buttons = (el: DexToolbar): HTMLButtonElement[] => [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('button')];
const labelOf = (b: Element | null | undefined): string | undefined => b?.querySelector('.label')?.textContent ?? undefined;
const button = (el: DexToolbar, label: string): HTMLButtonElement => buttons(el).find((b) => labelOf(b) === label)!;

// The row as the user reads it, left to right: each button's label, `|` for a separator and
// `<->` for the spacer that pushes the end items to the right.
const row = (el: DexToolbar): string[] =>
  [...bar(el).children].map((c) =>
    c.matches('button')
      ? labelOf(c)!
      : c.classList.contains('separator')
        ? '|'
        : c.classList.contains('spacer')
          ? '<->'
          : `?${c.tagName}`,
  );

const focused = (el: DexToolbar): string | undefined => labelOf(el.shadowRoot!.activeElement);
const tabStops = (el: DexToolbar): string[] =>
  buttons(el)
    .filter((b) => b.getAttribute('tabindex') === '0')
    .map((b) => labelOf(b)!);

// A key pressed where the keyboard is: on the focused button, or the first when none is.
function press(el: DexToolbar, key: string): KeyboardEvent {
  const at = el.shadowRoot!.activeElement ?? buttons(el)[0]!;
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true });
  at.dispatchEvent(e);
  return e;
}

// Every dex-toolbar-action that reaches the document, as an app listening there would hear it.
function actions(): CustomEvent<ToolbarActionDetail>[] {
  const heard: CustomEvent<ToolbarActionDetail>[] = [];
  document.addEventListener('dex-toolbar-action', (e) => heard.push(e));
  return heard;
}

describe('the row', () => {
  it('draws the start items, a spacer, then the end items, each in the order given', async () => {
    const el = await toolbar([
      { id: 'cut', label: 'Cut', align: 'end' },
      { id: 'open', label: 'Open' },
      { id: 'copy', label: 'Copy', align: 'end' },
      { id: 'save', label: 'Save', align: 'start' },
    ]);
    expect(row(el)).toEqual(['Open', 'Save', '<->', 'Cut', 'Copy']);
  });

  it("is the prototype's row: a separator between groups, and none at either end of a side", async () => {
    const el = await toolbar(TS_ROW);
    expect(row(el)).toEqual([
      'Open', 'Folder', '|', 'Save', 'Save As', 'Save All', '|', 'Close',
      '<->',
      'Undo', 'Redo', '|', 'Add Child', '|', 'Cut', 'Copy', 'Paste', '|', 'Delete',
    ]);
  });

  it('puts no separator across the spacer, even where the two sides share a group', async () => {
    // A separator says "these belong apart" between neighbours; the spacer already says it, and
    // a line at either end of a side would stand against nothing.
    const el = await toolbar([
      { id: 'a', label: 'A', group: 'g' },
      { id: 'b', label: 'B', group: 'h' },
      { id: 'c', label: 'C', group: 'h', align: 'end' },
      { id: 'd', label: 'D', group: 'g', align: 'end' },
    ]);
    expect(row(el)).toEqual(['A', '|', 'B', '<->', 'C', '|', 'D']);
  });

  it('draws a side with no items as nothing at all', async () => {
    expect(row(await toolbar([{ id: 'cut', label: 'Cut', group: 'x', align: 'end' }]))).toEqual(['<->', 'Cut']);
    document.body.replaceChildren();
    expect(row(await toolbar([{ id: 'open', label: 'Open', group: 'x' }]))).toEqual(['Open', '<->']);
    document.body.replaceChildren();
    expect(row(await toolbar([]))).toEqual(['<->']);
  });

  it('treats items with no group as one group, and a group after them as another', async () => {
    const el = await toolbar([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C', group: 'g' },
    ]);
    expect(row(el)).toEqual(['A', 'B', '|', 'C', '<->']);
  });

  it('is a toolbar to a screen reader, its separators separators and the spacer nothing', async () => {
    const el = await toolbar(TS_ROW);
    expect(bar(el).getAttribute('role')).toBe('toolbar');
    const separators = [...bar(el).querySelectorAll('.separator')];
    expect(separators).toHaveLength(5);
    for (const s of separators) {
      expect(s.getAttribute('role')).toBe('separator');
      expect(s.getAttribute('aria-orientation')).toBe('vertical');
    }
    expect(bar(el).querySelector('.spacer')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('is named Toolbar to a screen reader, or what its label says', async () => {
    // A page with a second toolbar (a view's own) needs to tell them apart by name.
    const el = await toolbar(TS_ROW);
    expect(el.label).toBe('Toolbar');
    expect(bar(el).getAttribute('aria-label')).toBe('Toolbar');
    el.label = 'File and edit';
    await el.updateComplete;
    expect(bar(el).getAttribute('aria-label')).toBe('File and edit');
    document.body.innerHTML = '<dex-toolbar label="Graph"></dex-toolbar>';
    const marked = document.body.querySelector('dex-toolbar')!;
    await marked.updateComplete;
    expect(marked.label).toBe('Graph');
    expect(bar(marked).getAttribute('aria-label')).toBe('Graph');
  });

  it("draws each item's icon from its data, over its label, and no icon where there is none", async () => {
    const el = await toolbar([
      { id: 'save', label: 'Save', icon: 'saved' },
      { id: 'plain', label: 'Plain' },
    ]);
    const icon = button(el, 'Save').querySelector('dex-icon') as DexIcon;
    expect(icon.iconId).toBe('saved');
    expect(icon.size).toBe(18);
    // The icon first: over the label in the normal layout, before it in the compact one.
    expect(button(el, 'Save').firstElementChild).toBe(icon);
    expect(button(el, 'Plain').querySelector('dex-icon')).toBeNull();
  });

  it("writes an item's label and tooltip as text, never as markup", async () => {
    // An app may build labels from what a file says (a recent file's name), so nothing in one may
    // become a node of the toolbar.
    const el = await toolbar([{ id: 'x', label: '<img src=x onerror=alert(1)>', title: '<b>t</b>' }]);
    expect(buttons(el)[0]!.querySelector('img')).toBeNull();
    expect(labelOf(buttons(el)[0])).toBe('<img src=x onerror=alert(1)>');
    expect(buttons(el)[0]!.getAttribute('title')).toBe('<b>t</b>');
  });
});

describe('the tooltip', () => {
  it("is the item's title when it has one, its label and chord when it has a shortcut, else its label", async () => {
    const el = await toolbar([
      { id: 'save', label: 'Save', shortcut: '⌘S', title: 'Save the file to disk' },
      { id: 'undo', label: 'Undo', shortcut: '⌘Z' },
      { id: 'close', label: 'Close' },
    ]);
    expect(button(el, 'Save').getAttribute('title')).toBe('Save the file to disk');
    expect(button(el, 'Undo').getAttribute('title')).toBe('Undo (⌘Z)');
    expect(button(el, 'Close').getAttribute('title')).toBe('Close');
  });
});

describe('a click', () => {
  it("sends dex-toolbar-action with the item's id, bubbling out of the shadow root", async () => {
    const heard = actions();
    const el = await toolbar(TS_ROW);
    button(el, 'Save As').click();
    expect(heard.map((e) => e.detail)).toEqual([{ actionId: 'saveAs' }]);
    expect(heard[0]!.bubbles).toBe(true);
    expect(heard[0]!.composed).toBe(true);
  });

  it("sends nothing a context menu's listener hears", async () => {
    // The menu's choice is dex-action. A page listening for it on the document, to run a table's
    // menu, must not run it for a toolbar press as well: each event has one sender.
    const menu: Event[] = [];
    document.addEventListener('dex-action', (e) => menu.push(e));
    const el = await toolbar(TS_ROW);
    button(el, 'Cut').click();
    expect(menu).toEqual([]);
  });

  it('on a disabled item sends nothing; the item is greyed but stays reachable', async () => {
    const heard = actions();
    const el = await toolbar(TS_ROW);
    const undo = button(el, 'Undo');
    undo.click();
    expect(heard).toEqual([]);
    // aria-disabled and not the disabled attribute: a disabled <button> leaves the tab order and
    // the arrow keys, and Undo would vanish for a keyboard user exactly when there is nothing to
    // undo, with no way to learn the action is there.
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    expect(undo.disabled).toBe(false);
    expect(button(el, 'Save').getAttribute('aria-disabled')).toBe('false');
  });
});

describe('the compact layout', () => {
  it('reflects, and draws the icons smaller', async () => {
    const el = await toolbar(TS_ROW);
    expect(el.hasAttribute('compact')).toBe(false);
    el.compact = true;
    await el.updateComplete;
    expect(el.hasAttribute('compact')).toBe(true);
    expect((button(el, 'Save').querySelector('dex-icon') as DexIcon).size).toBe(14);
    el.compact = false;
    await el.updateComplete;
    expect(el.hasAttribute('compact')).toBe(false);
    expect((button(el, 'Save').querySelector('dex-icon') as DexIcon).size).toBe(18);
  });

  it('is set by the compact attribute in markup', async () => {
    document.body.innerHTML = '<dex-toolbar compact></dex-toolbar>';
    const el = document.body.querySelector('dex-toolbar')!;
    el.items = [{ id: 'save', label: 'Save', icon: 'saved' }];
    await el.updateComplete;
    expect(el.compact).toBe(true);
    expect((button(el, 'Save').querySelector('dex-icon') as DexIcon).size).toBe(14);
  });

  it('lays the icon beside the label in a row, by a rule on the attribute', () => {
    // happy-dom applies no stylesheet, so the rule itself is what can be pinned here.
    const text = [DexToolbar.styles]
      .flat(Infinity)
      .map((s) => (s as { cssText: string }).cssText)
      .join('\n')
      .replace(/\s+/g, ' ');
    expect(text).toMatch(/:host\(\[compact\]\) button \{[^}]*flex-direction: row;/);
  });
});

describe('the keyboard', () => {
  it('reaches the toolbar as one tab stop, the first item until another is used', async () => {
    const el = await toolbar(TS_ROW);
    expect(tabStops(el)).toEqual(['Open']);
  });

  it('moves along the items with the arrow keys, wrapping at either end, disabled items included', async () => {
    const el = await toolbar(TS_ROW);
    buttons(el)[0]!.focus();
    press(el, 'ArrowRight');
    expect(focused(el)).toBe('Folder');
    press(el, 'ArrowLeft');
    press(el, 'ArrowLeft');
    // From the first item to the last, over the spacer.
    expect(focused(el)).toBe('Delete');
    press(el, 'ArrowRight');
    expect(focused(el)).toBe('Open');
    // Across the spacer, onto the disabled Undo.
    for (let i = 0; i < 6; i++) press(el, 'ArrowRight');
    expect(focused(el)).toBe('Undo');
    await el.updateComplete;
    // The tab stop goes with the keyboard: Tab away and back lands where the user left it.
    expect(tabStops(el)).toEqual(['Undo']);
  });

  it('goes to the first item on Home and the last on End', async () => {
    const el = await toolbar(TS_ROW);
    button(el, 'Cut').focus();
    press(el, 'Home');
    expect(focused(el)).toBe('Open');
    press(el, 'End');
    expect(focused(el)).toBe('Delete');
  });

  it('takes the arrow keys, Home and End from the page, and leaves Enter and Space to the button', async () => {
    // A native <button> activates itself on Enter and on Space (as a click, which is what sends
    // dex-toolbar-action), and a disabled one through aria-disabled still does, to the click handler that
    // refuses it. A keydown handler that prevented them would leave the keyboard no way to act.
    const el = await toolbar(TS_ROW);
    for (const b of buttons(el)) expect(b.getAttribute('type')).toBe('button');
    button(el, 'Copy').focus();
    expect(press(el, 'Enter').defaultPrevented).toBe(false);
    expect(press(el, ' ').defaultPrevented).toBe(false);
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) expect(press(el, key).defaultPrevented, key).toBe(true);
    expect(press(el, 'ArrowDown').defaultPrevented).toBe(false);
  });

  it('keeps the tab stop on a focused item', async () => {
    const el = await toolbar(TS_ROW);
    button(el, 'Paste').focus();
    await el.updateComplete;
    expect(tabStops(el)).toEqual(['Paste']);
  });

  it('takes no focus from a mouse press, on the button or on its icon or label', async () => {
    // Pressing a button with the mouse would otherwise move the focus onto it: after a toolbar
    // Delete or Paste the arrow keys would walk the toolbar, where the user was working in the
    // table. The press's default is what moves the focus, so it is refused; the click that follows
    // still sends the action. happy-dom moves no focus on a mousedown, so the refusal is what is
    // pinned.
    const el = await toolbar(TS_ROW);
    const heard = actions();
    const paste = button(el, 'Paste');
    for (const target of [paste, paste.querySelector('dex-icon')!, paste.querySelector('.label')!]) {
      const down = new MouseEvent('mousedown', { bubbles: true, composed: true, cancelable: true });
      target.dispatchEvent(down);
      expect(down.defaultPrevented, target.tagName).toBe(true);
    }
    paste.click();
    expect(heard.map((e) => e.detail.actionId)).toEqual(['paste']);
    // The keyboard still reaches the button: it stays in the row's roving tab order.
    paste.focus();
    expect(focused(el)).toBe('Paste');
  });
});

describe('new items', () => {
  it('redraw the row', async () => {
    const el = await toolbar(TS_ROW);
    el.items = [
      { id: 'undo', label: 'Undo', align: 'end' },
      { id: 'open', label: 'Open', group: 'a' },
      { id: 'find', label: 'Find', group: 'b' },
    ];
    await el.updateComplete;
    expect(row(el)).toEqual(['Open', '|', 'Find', '<->', 'Undo']);
  });

  it('turn an item on and off where it stands, keeping the tab stop on it', async () => {
    // What an app does on every selection change: the same items, Undo and Paste now enabled.
    const el = await toolbar(TS_ROW);
    button(el, 'Undo').focus();
    await el.updateComplete;
    el.items = TS_ROW.map((item) => ({ ...item, disabled: false }));
    await el.updateComplete;
    expect(button(el, 'Undo').getAttribute('aria-disabled')).toBe('false');
    expect(tabStops(el)).toEqual(['Undo']);
    // The same element, not a redrawn one in its place: the focus did not drop to the page.
    expect(focused(el)).toBe('Undo');
    const heard = actions();
    button(el, 'Undo').click();
    expect(heard.map((e) => e.detail.actionId)).toEqual(['undo']);
  });

  it('without the item that had the tab stop give it back to the first', async () => {
    const el = await toolbar(TS_ROW);
    button(el, 'Delete').focus();
    await el.updateComplete;
    el.items = TS_ROW.filter((item) => item.id !== 'delete');
    await el.updateComplete;
    expect(tabStops(el)).toEqual(['Open']);
  });
});

describe('defineToolbar', () => {
  it('registers the toolbar and the <dex-icon> it draws, and a second call is a no-op', () => {
    expect(customElements.get('dex-toolbar')).toBe(DexToolbar);
    expect(customElements.get('dex-icon')).toBe(DexIcon);
    expect(() => defineToolbar()).not.toThrow();
  });

  it('refuses a name another class holds', () => {
    customElements.define('dex-toolbar-taken', class extends HTMLElement {});
    expect(() => defineToolbar('dex-toolbar-taken')).toThrow(/already defined/);
  });
});
