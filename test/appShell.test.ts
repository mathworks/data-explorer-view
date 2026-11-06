// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// <dex-app-shell>: the layout every part of an app built on this package sits in. A page gives it
// views (`<dex-shell-view side="left" view="explorer" …>`) and actions (`<dex-shell-action>`), and
// the shell draws an activity button for each, shows one view per side, closes a side when its
// shown view's button is pressed again, resizes a side by its sash, and keeps all of that under its
// storage key. Pinned here is what a person sees and what the page hears: the buttons in the
// shadow root and their tooltips, the `hidden` each view gets, the events, and the kept layout as a
// second shell reads it back. The rules themselves (what a click does to a side, the sizes a sash
// is held to) are shellLayout.test.ts's; this is that the element follows them.
//
// happy-dom lays nothing out, so every box measures 0 there and a resize is held only to the
// side's minimum; the test of the room a resize leaves the center gives the boxes sizes of its own.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DexAppShell, defineAppShell, type ShellActionDetail, type ShellViewChangedDetail } from '../src/widgets/app-shell/dex-app-shell.js';
import { DexShellAction, DexShellView } from '../src/widgets/app-shell/dex-shell-view.js';
import type { ShellSide } from '../src/model/shell/shellLayout.js';

beforeAll(() => defineAppShell());

// Chords are labelled and matched for the platform the page runs on, read from navigator.platform
// at each press and each render, so a test names its platform. Off macOS unless it says otherwise.
const onPlatform = (name: string): void => {
  Object.defineProperty(navigator, 'platform', { value: name, configurable: true });
};
beforeEach(() => onPlatform('Win32'));
afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  Reflect.deleteProperty(navigator, 'platform');
});

// The shell hears about its children from a MutationObserver, and each child reflects its
// properties in an update of its own: a few turns of the event loop settle all of it.
async function settle(shell: DexAppShell): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await shell.updateComplete;
  }
}

function view(side: ShellSide, id: string, label: string, shortcut = ''): DexShellView {
  const el = document.createElement('dex-shell-view');
  el.side = side;
  el.view = id;
  el.label = label;
  el.icon = 'filesSB';
  el.shortcut = shortcut;
  el.textContent = `${label} content`;
  return el;
}

function action(side: 'left' | 'right', id: string, label: string, shortcut = ''): DexShellAction {
  const el = document.createElement('dex-shell-action');
  el.side = side;
  el.action = id;
  el.label = label;
  el.icon = 'settings';
  el.shortcut = shortcut;
  return el;
}

// Two views on each side, written in an order that interleaves the sides, and an action on the left.
const standard = (): Element[] => [
  view('left', 'explorer', 'Explorer', 'Mod+Shift+E'),
  view('right', 'properties', 'Properties', 'Mod+Shift+I'),
  view('left', 'search', 'Search', 'Mod+Shift+F'),
  view('right', 'raw', 'Raw'),
  action('left', 'settings', 'Settings', 'Mod+,'),
];

async function mount(children: Element[] = standard(), storageKey = ''): Promise<DexAppShell> {
  const shell = document.createElement('dex-app-shell');
  if (storageKey) shell.setAttribute('storage-key', storageKey);
  shell.append(...children);
  document.body.append(shell);
  await settle(shell);
  return shell;
}

const part = (shell: DexAppShell, selector: string): HTMLElement | null => shell.shadowRoot!.querySelector<HTMLElement>(selector);
const buttonsIn = (shell: DexAppShell, selector: string): HTMLButtonElement[] => [
  ...shell.shadowRoot!.querySelectorAll<HTMLButtonElement>(`${selector} button`),
];
const button = (shell: DexAppShell, label: string): HTMLButtonElement =>
  [...shell.shadowRoot!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label') === label)!;
const viewOf = (shell: DexAppShell, id: string): DexShellView => [...shell.querySelectorAll('dex-shell-view')].find((v) => v.view === id)!;
const sash = (shell: DexAppShell, side: ShellSide): HTMLElement => part(shell, `.resizer[data-side='${side}']`)!;

function viewChanges(shell: DexAppShell): ShellViewChangedDetail[] {
  const got: ShellViewChangedDetail[] = [];
  shell.addEventListener('dex-shell-view-changed', (e) => got.push(e.detail));
  return got;
}

function actions(shell: DexAppShell): ShellActionDetail[] {
  const got: ShellActionDetail[] = [];
  shell.addEventListener('dex-shell-action', (e) => got.push(e.detail));
  return got;
}

// A key press where a person makes it: on the page, bubbling to the window the shell listens on.
function press(init: KeyboardEventInit): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, composed: true, ...init });
  document.body.dispatchEvent(e);
  return e;
}

// A box of the given size, for the parts happy-dom cannot measure.
const rect = (x: number, y: number, width: number, height: number): DOMRect => new DOMRect(x, y, width, height);

describe('the activity buttons', () => {
  it('draws one per view, in the order of the page, on its side, with its label and chord', async () => {
    const shell = await mount();
    const views = (side: string) => buttonsIn(shell, `nav.activity.${side}`).filter((b) => b.hasAttribute('aria-pressed'));
    expect(views('left').map((b) => b.getAttribute('aria-label'))).toEqual(['Explorer', 'Search']);
    expect(views('right').map((b) => b.getAttribute('aria-label'))).toEqual(['Properties', 'Raw']);
    // The title names the chord in the platform's words; a view with no chord is just its label.
    expect(views('left').map((b) => b.title)).toEqual(['Explorer (Ctrl+Shift+E)', 'Search (Ctrl+Shift+F)']);
    expect(views('right').map((b) => b.title)).toEqual(['Properties (Ctrl+Shift+I)', 'Raw']);
    expect(views('left')[0]!.querySelector('dex-icon')?.iconId).toBe('filesSB');
  });

  it("labels the chords in Apple's order on macOS", async () => {
    onPlatform('MacIntel');
    const shell = await mount();
    expect(button(shell, 'Explorer').title).toBe('Explorer (⇧⌘E)');
    expect(button(shell, 'Settings').title).toBe('Settings (⌘,)');
  });

  it("draws an action's button at the end of its side's bar, after the views", async () => {
    const shell = await mount();
    const left = buttonsIn(shell, 'nav.activity.left');
    expect(left.map((b) => b.getAttribute('aria-label'))).toEqual(['Explorer', 'Search', 'Settings']);
    // A plain button: it opens something of the page's, and is never pressed in.
    expect(left[2]!.hasAttribute('aria-pressed')).toBe(false);
    expect(left[2]!.title).toBe('Settings (Ctrl+,)');
  });

  it('draws one button for an id, and hides a second view or action that has it', async () => {
    // showView, anchorOf and the kept layout name a view by its id, so a second view with the id
    // would be one no button could reach, drawn in the side under the first.
    const twin = view('left', 'explorer', 'Twin');
    const shell = await mount([...standard(), twin, action('left', 'settings', 'Settings again')]);
    expect(buttonsIn(shell, 'nav.activity.left').map((b) => b.getAttribute('aria-label'))).toEqual(['Explorer', 'Search', 'Settings']);
    expect(twin.hidden).toBe(true);
    expect(viewOf(shell, 'explorer').hidden).toBe(false);
  });

  it('draws no bar and no sidebar for a side with no views', async () => {
    const shell = await mount([view('left', 'explorer', 'Explorer')]);
    expect(part(shell, 'nav.activity.left')).not.toBeNull();
    expect(part(shell, 'nav.activity.right')).toBeNull();
    expect(part(shell, 'aside.side.right')).toBeNull();
    expect(part(shell, ".resizer[data-side='right']")).toBeNull();
    expect(shell.layout.right).toEqual({ view: null, open: false, size: 240 });
  });
});

describe('which view a side shows', () => {
  it('shows the first view of each side and hides the others', async () => {
    const shell = await mount();
    expect(viewOf(shell, 'explorer').hidden).toBe(false);
    expect(viewOf(shell, 'search').hidden).toBe(true);
    expect(viewOf(shell, 'properties').hidden).toBe(false);
    expect(viewOf(shell, 'raw').hidden).toBe(true);
    expect(button(shell, 'Explorer').getAttribute('aria-pressed')).toBe('true');
    expect(button(shell, 'Search').getAttribute('aria-pressed')).toBe('false');
    // Each in its side's slot, so the sidebar draws it.
    expect(viewOf(shell, 'explorer').slot).toBe('left');
    expect(viewOf(shell, 'raw').slot).toBe('right');
  });

  it("heads the sidebar with the shown view's label, and follows a label changed later", async () => {
    const shell = await mount();
    expect(part(shell, 'aside.side.left .header')?.textContent?.trim()).toBe('Explorer');
    expect(part(shell, 'aside.side.right .header')?.textContent?.trim()).toBe('Properties');
    viewOf(shell, 'explorer').label = 'Files';
    await settle(shell);
    expect(part(shell, 'aside.side.left .header')?.textContent?.trim()).toBe('Files');
    expect(button(shell, 'Files').title).toBe('Files (Ctrl+Shift+E)');
  });

  it("shows a hidden view when its button is pressed, and says so", async () => {
    const shell = await mount();
    const changes = viewChanges(shell);
    button(shell, 'Search').click();
    await settle(shell);
    expect(viewOf(shell, 'search').hidden).toBe(false);
    expect(viewOf(shell, 'explorer').hidden).toBe(true);
    expect(changes).toEqual([{ side: 'left', view: 'search', open: true }]);
    expect(shell.layout.left).toMatchObject({ view: 'search', open: true });
    expect(part(shell, 'aside.side.left .header')?.textContent?.trim()).toBe('Search');
    expect(button(shell, 'Search').getAttribute('aria-pressed')).toBe('true');
  });

  it("closes the side when the shown view's button is pressed, and opens it on the same view again", async () => {
    const shell = await mount();
    const changes = viewChanges(shell);
    button(shell, 'Explorer').click();
    await settle(shell);
    expect(part(shell, 'aside.side.left')).toBeNull();
    expect(part(shell, ".resizer[data-side='left']")).toBeNull();
    expect(viewOf(shell, 'explorer').hidden).toBe(true);
    expect(button(shell, 'Explorer').getAttribute('aria-pressed')).toBe('false');
    expect(changes).toEqual([{ side: 'left', view: 'explorer', open: false }]);

    button(shell, 'Explorer').click();
    await settle(shell);
    expect(part(shell, 'aside.side.left')).not.toBeNull();
    expect(viewOf(shell, 'explorer').hidden).toBe(false);
    expect(changes.at(-1)).toEqual({ side: 'left', view: 'explorer', open: true });
  });

  it('does what the buttons do from showView and toggleView', async () => {
    const shell = await mount();
    const changes = viewChanges(shell);
    shell.showView('search');
    await settle(shell);
    expect(viewOf(shell, 'search').hidden).toBe(false);
    // Shown already: showView never closes, and says nothing when nothing changed.
    shell.showView('search');
    expect(changes).toEqual([{ side: 'left', view: 'search', open: true }]);

    shell.toggleView('search');
    await settle(shell);
    expect(part(shell, 'aside.side.left')).toBeNull();
    shell.toggleView('raw');
    await settle(shell);
    expect(viewOf(shell, 'raw').hidden).toBe(false);
    expect(changes.slice(1)).toEqual([
      { side: 'left', view: 'search', open: false },
      { side: 'right', view: 'raw', open: true },
    ]);

    // An id the shell has no view for does nothing.
    shell.showView('nowhere');
    shell.toggleView('nowhere');
    expect(changes).toHaveLength(3);
  });
});

describe('the chords', () => {
  it("toggles a view by its shortcut, with Ctrl off macOS", async () => {
    const shell = await mount();
    const changes = viewChanges(shell);
    const e = press({ key: 'E', ctrlKey: true, shiftKey: true });
    await settle(shell);
    expect(e.defaultPrevented).toBe(true);
    expect(part(shell, 'aside.side.left')).toBeNull();
    press({ key: 'F', ctrlKey: true, shiftKey: true });
    await settle(shell);
    expect(viewOf(shell, 'search').hidden).toBe(false);
    expect(changes).toEqual([
      { side: 'left', view: 'explorer', open: false },
      { side: 'left', view: 'search', open: true },
    ]);
    // Command is not Ctrl here, and a chord with one more modifier is another chord.
    expect(press({ key: 'E', metaKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(press({ key: 'E', ctrlKey: true, shiftKey: true, altKey: true }).defaultPrevented).toBe(false);
    expect(changes).toHaveLength(2);
  });

  it('toggles a view by its shortcut with Command on macOS, and not with Ctrl', async () => {
    onPlatform('MacIntel');
    const shell = await mount();
    const changes = viewChanges(shell);
    expect(press({ key: 'I', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    press({ key: 'I', metaKey: true, shiftKey: true });
    await settle(shell);
    expect(part(shell, 'aside.side.right')).toBeNull();
    expect(changes).toEqual([{ side: 'right', view: 'properties', open: false }]);
  });

  it('leaves a press another handler took, and stops listening once the shell is removed', async () => {
    const shell = await mount();
    const changes = viewChanges(shell);
    const taken = new KeyboardEvent('keydown', { key: 'E', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
    taken.preventDefault();
    document.body.dispatchEvent(taken);
    expect(changes).toEqual([]);

    shell.remove();
    expect(press({ key: 'E', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(changes).toEqual([]);
  });
});

describe('the actions', () => {
  it("sends dex-shell-action with the button's box when an action's button is pressed", async () => {
    const shell = await mount();
    const sent = actions(shell);
    const settings = button(shell, 'Settings');
    settings.getBoundingClientRect = () => rect(0, 600, 36, 36);
    settings.click();
    expect(sent).toEqual([{ actionId: 'settings', anchor: { x: 0, y: 600, width: 36, height: 36 } }]);
    // Pressing an action changes no layout.
    expect(shell.layout.left).toMatchObject({ view: 'explorer', open: true });
  });

  it("sends it for the action's shortcut too, anchored at the same button", async () => {
    const shell = await mount();
    const sent = actions(shell);
    button(shell, 'Settings').getBoundingClientRect = () => rect(0, 600, 36, 36);
    expect(press({ key: ',', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(sent).toEqual([{ actionId: 'settings', anchor: { x: 0, y: 600, width: 36, height: 36 } }]);
  });

  it('gives the box of the button of a view or an action from anchorOf, and null for an id it has none for', async () => {
    const shell = await mount();
    button(shell, 'Search').getBoundingClientRect = () => rect(0, 120, 36, 36);
    button(shell, 'Settings').getBoundingClientRect = () => rect(0, 600, 36, 36);
    expect(shell.anchorOf('search')).toMatchObject({ x: 0, y: 120, width: 36, height: 36 });
    expect(shell.anchorOf('settings')).toMatchObject({ x: 0, y: 600, width: 36, height: 36 });
    expect(shell.anchorOf('nowhere')).toBeNull();
  });
});

describe('the rows across the top', () => {
  it("puts the page's toolbar and location bar in their rows, with a line under the toolbar", async () => {
    const toolbar = Object.assign(document.createElement('div'), { slot: 'toolbar' });
    const location = Object.assign(document.createElement('div'), { slot: 'location' });
    const shell = await mount([...standard(), toolbar, location]);
    expect((part(shell, ".toolbar-row slot[name='toolbar']") as HTMLSlotElement).assignedElements()).toEqual([toolbar]);
    expect((part(shell, ".location-row slot[name='location']") as HTMLSlotElement).assignedElements()).toEqual([location]);
    expect(part(shell, '.toolbar-row')!.classList.contains('filled')).toBe(true);
  });

  it('draws no line where there is no toolbar, and draws it under one added later', async () => {
    const shell = await mount();
    expect(part(shell, '.toolbar-row')!.classList.contains('filled')).toBe(false);
    shell.append(Object.assign(document.createElement('div'), { slot: 'toolbar' }));
    await settle(shell);
    expect(part(shell, '.toolbar-row')!.classList.contains('filled')).toBe(true);
  });
});

describe('the bottom panel and the status bar', () => {
  it("draws a bottom view's panel, headed with its label, and its button in the status bar", async () => {
    const shell = await mount([...standard(), view('bottom', 'terminal', 'Terminal', 'Mod+`'), view('bottom', 'log', 'Log')]);
    expect(part(shell, '.center section.bottom')).not.toBeNull();
    expect(part(shell, 'section.bottom .header')?.textContent?.trim()).toBe('Terminal');
    expect(part(shell, ".resizer[data-side='bottom']")?.getAttribute('aria-orientation')).toBe('horizontal');
    const status = buttonsIn(shell, 'footer.status-bar');
    expect(status.map((b) => b.getAttribute('aria-label'))).toEqual(['Terminal', 'Log']);
    expect(status[0]!.title).toBe('Terminal (Ctrl+`)');
    expect(viewOf(shell, 'terminal').slot).toBe('bottom');
    expect(viewOf(shell, 'log').hidden).toBe(true);

    status[0]!.click();
    await settle(shell);
    expect(part(shell, 'section.bottom')).toBeNull();
    expect(viewOf(shell, 'terminal').hidden).toBe(true);
  });

  it('draws no bottom panel without a bottom view, and the status bar all the same', async () => {
    const shell = await mount();
    expect(part(shell, 'section.bottom')).toBeNull();
    expect(part(shell, ".resizer[data-side='bottom']")).toBeNull();
    expect(part(shell, 'footer.status-bar')).not.toBeNull();
    expect(buttonsIn(shell, 'footer.status-bar')).toEqual([]);
  });

  it("puts the page's status content in the status bar", async () => {
    const note = document.createElement('span');
    note.slot = 'status';
    note.textContent = 'MAT-file · Modified';
    const shell = await mount([...standard(), note]);
    const slot = part(shell, "footer.status-bar slot[name='status']") as HTMLSlotElement;
    expect(slot.assignedElements()).toEqual([note]);
  });
});

describe('resizing', () => {
  it('grows the left side by 16 px for ArrowRight on its separator, and keeps the size', async () => {
    const shell = await mount(standard(), 'shell-test');
    const left = sash(shell, 'left');
    expect(left.getAttribute('role')).toBe('separator');
    expect(left.getAttribute('aria-orientation')).toBe('vertical');
    expect(left.tabIndex).toBe(0);
    left.focus();
    left.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await settle(shell);
    expect(shell.layout.left.size).toBe(236);
    expect(part(shell, 'aside.side.left')!.style.width).toBe('236px');
    expect(sash(shell, 'left').getAttribute('aria-valuenow')).toBe('236');

    shell.remove();
    const again = await mount(standard(), 'shell-test');
    expect(again.layout.left.size).toBe(236);
  });

  it('moves each separator the way its side grows: the right one left, the bottom one up', async () => {
    const shell = await mount([...standard(), view('bottom', 'terminal', 'Terminal')]);
    const key = (side: ShellSide, k: string) =>
      sash(shell, side).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    key('right', 'ArrowLeft');
    key('bottom', 'ArrowUp');
    key('left', 'ArrowLeft');
    await settle(shell);
    expect([shell.layout.left.size, shell.layout.right.size, shell.layout.bottom.size]).toEqual([204, 256, 166]);
  });

  it('follows a drag of the separator, held to the side minimum, and keeps the size when it ends', async () => {
    const shell = await mount(standard(), 'shell-test');
    const left = sash(shell, 'left');
    left.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: 257, clientY: 300, bubbles: true }));
    left.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 307, clientY: 300, bubbles: true }));
    await settle(shell);
    expect(shell.layout.left.size).toBe(270);
    left.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: -500, clientY: 300, bubbles: true }));
    await settle(shell);
    expect(shell.layout.left.size).toBe(140);
    // Nothing is kept until the drag ends.
    expect(localStorage.getItem('shell-test')).toBeNull();
    left.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: -500, clientY: 300, bubbles: true }));
    expect(JSON.parse(localStorage.getItem('shell-test')!).left.size).toBe(140);
    // A move after the end resizes nothing.
    left.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 400, clientY: 300, bubbles: true }));
    await settle(shell);
    expect(shell.layout.left.size).toBe(140);
  });

  it('grows the right side as its separator is dragged left, and the bottom panel as its goes up', async () => {
    const shell = await mount([...standard(), view('bottom', 'terminal', 'Terminal')]);
    const drag = (side: ShellSide, from: { clientX: number; clientY: number }, to: { clientX: number; clientY: number }) => {
      const target = sash(shell, side);
      target.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, button: 0, ...from, bubbles: true }));
      target.dispatchEvent(new PointerEvent('pointermove', { pointerId: 2, ...to, bubbles: true }));
      target.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, ...to, bubbles: true }));
    };
    drag('right', { clientX: 700, clientY: 300 }, { clientX: 670, clientY: 310 });
    drag('bottom', { clientX: 400, clientY: 500 }, { clientX: 420, clientY: 480 });
    expect([shell.layout.right.size, shell.layout.bottom.size]).toEqual([270, 170]);
  });

  it('leaves the center 200 px of the room it shares with the side', async () => {
    const shell = await mount();
    // The left side and the center share 220 + 300 px, so the side grows to 320 px at most.
    part(shell, '.center')!.getBoundingClientRect = () => rect(261, 80, 300, 600);
    part(shell, 'aside.side.left')!.getBoundingClientRect = () => rect(37, 80, 220, 600);
    const left = sash(shell, 'left');
    left.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: 257, clientY: 300, bubbles: true }));
    left.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 900, clientY: 300, bubbles: true }));
    left.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 900, clientY: 300, bubbles: true }));
    expect(shell.layout.left.size).toBe(320);
  });
});

describe('what is kept', () => {
  it('restores, in a new shell with the same storage key, the view each side showed and a side closed', async () => {
    const shell = await mount(standard(), 'shell-test');
    button(shell, 'Search').click();
    button(shell, 'Properties').click();
    await settle(shell);
    shell.remove();

    const again = await mount(standard(), 'shell-test');
    expect(again.layout.left).toMatchObject({ view: 'search', open: true });
    expect(again.layout.right).toMatchObject({ view: 'properties', open: false });
    expect(viewOf(again, 'search').hidden).toBe(false);
    expect(part(again, 'aside.side.right')).toBeNull();
  });

  it('keeps nothing without a storage key', async () => {
    const shell = await mount();
    button(shell, 'Search').click();
    shell.remove();
    expect(localStorage.length).toBe(0);
    const again = await mount();
    expect(again.layout.left).toMatchObject({ view: 'explorer', open: true });
  });

  it('reads what was kept for a side when its views arrive after the shell is on the page', async () => {
    localStorage.setItem('shell-test', JSON.stringify({ left: { view: 'search', open: true, size: 300 } }));
    const shell = await mount([], 'shell-test');
    expect(shell.layout.left).toMatchObject({ view: null, open: false });
    // A press of the right side's view keeps the layout before the left side has views: what was
    // kept for the left stays.
    shell.append(view('right', 'properties', 'Properties'));
    await settle(shell);
    button(shell, 'Properties').click();
    shell.append(...standard().filter((v) => (v as DexShellView).side === 'left'));
    await settle(shell);
    expect(shell.layout.left).toEqual({ view: 'search', open: true, size: 300 });
    expect(viewOf(shell, 'search').hidden).toBe(false);
  });
});

describe('views added and removed', () => {
  it('draws a view added later, on its side, and opens a side that had none on it', async () => {
    const shell = await mount([view('left', 'explorer', 'Explorer')]);
    shell.append(view('left', 'search', 'Search'), view('right', 'properties', 'Properties'));
    await settle(shell);
    expect(buttonsIn(shell, 'nav.activity.left').map((b) => b.getAttribute('aria-label'))).toEqual(['Explorer', 'Search']);
    expect(viewOf(shell, 'search').hidden).toBe(true);
    expect(shell.layout.right).toMatchObject({ view: 'properties', open: true });
    expect(part(shell, 'aside.side.right')).not.toBeNull();
  });

  it('falls back to the first view left when the shown one is removed, and takes the side away with the last', async () => {
    const shell = await mount();
    button(shell, 'Search').click();
    await settle(shell);
    viewOf(shell, 'search').remove();
    await settle(shell);
    expect(shell.layout.left).toMatchObject({ view: 'explorer', open: true });
    expect(viewOf(shell, 'explorer').hidden).toBe(false);
    viewOf(shell, 'explorer').remove();
    await settle(shell);
    expect(part(shell, 'aside.side.left')).toBeNull();
    // The action keeps the bar: it has nowhere else to be.
    expect(buttonsIn(shell, 'nav.activity.left').map((b) => b.getAttribute('aria-label'))).toEqual(['Settings']);
  });
});

describe('defineAppShell', () => {
  it('defines the shell and its two parts, and does nothing when asked again', () => {
    expect(customElements.get('dex-app-shell')).toBe(DexAppShell);
    expect(customElements.get('dex-shell-view')).toBe(DexShellView);
    expect(customElements.get('dex-shell-action')).toBe(DexShellAction);
    expect(customElements.get('dex-icon')).toBeDefined();
    expect(() => defineAppShell()).not.toThrow();
  });

  it('throws for a tag another class holds, naming both', () => {
    customElements.define('x-taken-shell', class Theirs extends HTMLElement {});
    expect(() => defineAppShell('x-taken-shell')).toThrow('<x-taken-shell> is already defined as Theirs; it cannot also be DexAppShell');
  });
});
