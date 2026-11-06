// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// <dex-location-bar>: the app shell's second row, Back, Forward and Up beside a breadcrumb of
// where the user is ("Root › dd.sldd › Design Data"). It draws the segments it is given and asks
// for a move; it keeps no history and works out no path, so what is pinned here is the drawing
// (each segment's icon and label, the separators, which one is the current place) and the one
// request it sends, `dex-location-go`, with what it carries. A button the app has said cannot be
// used must send nothing: the app's history would otherwise step past its end.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  DexLocationBar,
  defineLocationBar,
  type LocationGoDetail,
  type LocationSegment,
} from '../src/widgets/app-shell/dex-location-bar.js';
import { THEME_SETS } from './tools/cssTokens.js';

beforeAll(() => defineLocationBar());

// What heard() put on the document, taken off after each case so no case hears another's clicks.
const listening: Array<(e: CustomEvent<LocationGoDetail>) => void> = [];
afterEach(() => {
  for (const listener of listening.splice(0)) document.removeEventListener('dex-location-go', listener);
  document.body.replaceChildren();
});

const PATH: LocationSegment[] = [
  { label: 'Root', icon: 'folder' },
  { label: 'dd.sldd *', icon: 'simulink_database', title: '/work/dd.sldd' },
  { label: 'Design Data' },
];

async function bar(props: Partial<Pick<DexLocationBar, 'segments' | 'canBack' | 'canForward' | 'canUp' | 'mono'>> = {}): Promise<DexLocationBar> {
  const el = document.createElement('dex-location-bar');
  Object.assign(el, props);
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const segments = (el: DexLocationBar): HTMLButtonElement[] => [
  ...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('button.segment'),
];
const labels = (el: DexLocationBar): string[] => segments(el).map((b) => b.querySelector('.label')!.textContent!);
const separators = (el: DexLocationBar): HTMLElement[] => [...el.shadowRoot!.querySelectorAll<HTMLElement>('.separator')];
const navButton = (el: DexLocationBar, name: 'Back' | 'Forward' | 'Up'): HTMLButtonElement =>
  el.shadowRoot!.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;

// Every dex-location-go the bar sends, heard on the document: it has to leave the shadow root
// and bubble that far for an app listening on the shell or the page to hear it.
function heard(): LocationGoDetail['to'][] {
  const seen: LocationGoDetail['to'][] = [];
  const listener = (e: CustomEvent<LocationGoDetail>): void => {
    seen.push(e.detail.to);
  };
  listening.push(listener);
  document.addEventListener('dex-location-go', listener);
  return seen;
}

describe('the breadcrumb', () => {
  it('draws each segment as a button, with its icon at 14px and its label', async () => {
    const el = await bar({ segments: PATH });
    expect(labels(el)).toEqual(['Root', 'dd.sldd *', 'Design Data']);
    const icons = segments(el).map((b) => b.querySelector('dex-icon'));
    expect(icons.map((i) => i?.iconId ?? null)).toEqual(['folder', 'simulink_database', null]);
    expect(icons[0]!.size).toBe(14);
    for (const b of segments(el)) expect(b.type).toBe('button');
  });

  it('puts a › between each two segments, hidden from a screen reader', async () => {
    // The list already tells a screen reader there are three places; a "›" read between them
    // would be noise.
    const el = await bar({ segments: PATH });
    expect(separators(el).map((s) => s.textContent)).toEqual(['›', '›']);
    for (const s of separators(el)) expect(s.getAttribute('aria-hidden')).toBe('true');
    // Between, and only between: none before the first segment.
    const items = [...el.shadowRoot!.querySelectorAll('li')];
    expect(items.map((li) => li.querySelector('.separator') !== null)).toEqual([false, true, true]);
  });

  it('marks the last segment as the current place, and only that one', async () => {
    const el = await bar({ segments: PATH });
    expect(segments(el).map((b) => b.getAttribute('aria-current'))).toEqual([null, null, 'location']);
  });

  it('dims a previewed segment, and marks the place before it as the current one', async () => {
    // A file selected in the graph at Root is a place previewed, not gone to: Root is where the
    // user is, and the file is drawn after it, dimmed, for a press to go to.
    const el = await bar({ segments: [{ label: 'Root' }, { label: 'plant.sldd', preview: true }] });
    expect(segments(el).map((b) => b.classList.contains('preview'))).toEqual([false, true]);
    expect(segments(el).map((b) => b.getAttribute('aria-current'))).toEqual(['location', null]);
    expect(getComputedStyle(segments(el)[1]!).opacity).toBe('0.7');
  });

  it("tells a screen reader a segment's description, where it has one", async () => {
    const el = await bar({ segments: [{ label: 'Root' }, { label: 'plant.sldd', preview: true, description: 'selected in the graph' }] });
    expect(segments(el).map((b) => b.getAttribute('aria-description'))).toEqual([null, 'selected in the graph']);
  });

  it("names a segment to a screen reader as its ariaLabel says, where its label reads badly aloud", async () => {
    // "<3 selected>" is heard as "less than 3 selected greater than": the segment says "3 rows selected".
    const el = await bar({ segments: [...PATH, { label: '<3 selected>', ariaLabel: '3 rows selected' }] });
    expect(segments(el)[3]!.getAttribute('aria-label')).toBe('3 rows selected');
    expect(labels(el)[3]).toBe('<3 selected>');
    expect(segments(el)[1]!.hasAttribute('aria-label')).toBe(false);
  });

  it('gives a segment its title as a tooltip, and one without none', async () => {
    const el = await bar({ segments: PATH });
    expect(segments(el).map((b) => b.getAttribute('title'))).toEqual([null, '/work/dd.sldd', null]);
  });

  it('is a navigation landmark called Location, the segments a list in it', async () => {
    const el = await bar({ segments: PATH });
    const nav = el.shadowRoot!.querySelector('nav')!;
    expect(nav.getAttribute('aria-label')).toBe('Location');
    expect(nav.querySelectorAll('ol > li > button.segment').length).toBe(3);
  });

  it('draws a label as text, never as markup', async () => {
    // A label is a name out of the opened file (an entry, a section), so it must not be able to
    // put nodes into the bar.
    const el = await bar({ segments: [{ label: '<img src=x onerror=alert(1)>' }] });
    expect(el.shadowRoot!.querySelectorAll('.segment img').length).toBe(0);
    expect(labels(el)).toEqual(['<img src=x onerror=alert(1)>']);
  });

  it('draws the new path when the segments are replaced', async () => {
    const el = await bar({ segments: PATH });
    el.segments = [{ label: 'Root', icon: 'folder' }];
    await el.updateComplete;
    expect(labels(el)).toEqual(['Root']);
    expect(separators(el)).toEqual([]);
    expect(segments(el)[0]!.getAttribute('aria-current')).toBe('location');
  });

  it('with no segments, draws the box empty and the buttons still', async () => {
    // What the shell shows before anything is open: the row keeps its place and its controls.
    const el = await bar();
    expect(el.segments).toEqual([]);
    const box = el.shadowRoot!.querySelector('.path')!;
    expect(box).not.toBeNull();
    expect(box.querySelectorAll('li').length).toBe(0);
    expect(separators(el)).toEqual([]);
    for (const name of ['Back', 'Forward', 'Up'] as const) expect(navButton(el, name)).not.toBeNull();
  });
});

describe('a click on a segment', () => {
  it('asks to go to that segment, by its index', async () => {
    const el = await bar({ segments: PATH });
    const seen = heard();
    segments(el)[0]!.click();
    segments(el)[1]!.click();
    expect(seen).toEqual([0, 1]);
  });

  it('asks for the last one too: whether that is a move is the app\'s call', async () => {
    // From an entry, its own segment can mean "back to the list"; the bar cannot know.
    const el = await bar({ segments: PATH });
    const seen = heard();
    segments(el)[2]!.click();
    expect(seen).toEqual([2]);
  });

  it('sends an event that bubbles out of the shadow root', async () => {
    const el = await bar({ segments: PATH });
    let event: CustomEvent<LocationGoDetail> | null = null;
    el.addEventListener('dex-location-go', (e) => (event = e));
    segments(el)[1]!.click();
    expect(event!.bubbles).toBe(true);
    expect(event!.composed).toBe(true);
    expect(event!.detail).toEqual({ to: 1 });
  });
});

describe('Back, Forward and Up', () => {
  it('are three buttons with their icons at 16px, named for a screen reader', async () => {
    const el = await bar();
    const icons = (['Back', 'Forward', 'Up'] as const).map((name) => navButton(el, name).querySelector('dex-icon')!);
    expect(icons.map((i) => i.iconId)).toEqual(['arrowNavigationWestUI', 'arrowNavigationEastUI', 'arrowNavigationNorthUI']);
    for (const i of icons) expect(i.size).toBe(16);
    for (const name of ['Back', 'Forward', 'Up'] as const) {
      expect(navButton(el, name).type).toBe('button');
      expect(navButton(el, name).title).toBe(name);
    }
  });

  it('draw their icons in their own colours by default, and in one colour with `mono`', async () => {
    // The shell's Minimal icon style reaches the three buttons alone: a segment's icon is a file's
    // or an entry's kind, which its colours tell apart.
    const goIcons = (el: DexLocationBar) => (['Back', 'Forward', 'Up'] as const).map((name) => navButton(el, name).querySelector('dex-icon')!.mono);
    const segmentIcons = (el: DexLocationBar) => segments(el).flatMap((b) => [...b.querySelectorAll('dex-icon')].map((i) => i.mono));
    const el = await bar({ segments: PATH });
    expect(el.mono).toBe(false);
    expect(goIcons(el)).toEqual([false, false, false]);
    el.mono = true;
    await el.updateComplete;
    expect(el.hasAttribute('mono')).toBe(true);
    expect(goIcons(el)).toEqual([true, true, true]);
    expect(segmentIcons(el)).toEqual([false, false]);
    document.body.insertAdjacentHTML('beforeend', '<dex-location-bar mono></dex-location-bar>');
    const marked = document.body.lastElementChild as DexLocationBar;
    await marked.updateComplete;
    expect(goIcons(marked)).toEqual([true, true, true]);
  });

  it('are disabled until the app says each can be used', async () => {
    const el = await bar({ segments: PATH });
    for (const name of ['Back', 'Forward', 'Up'] as const) expect(navButton(el, name).disabled, name).toBe(true);
    el.canBack = true;
    await el.updateComplete;
    expect([navButton(el, 'Back').disabled, navButton(el, 'Forward').disabled, navButton(el, 'Up').disabled]).toEqual([
      false,
      true,
      true,
    ]);
  });

  it('each asks for its own move when it can be used', async () => {
    const el = await bar({ segments: PATH, canBack: true, canForward: true, canUp: true });
    const seen = heard();
    navButton(el, 'Back').click();
    navButton(el, 'Forward').click();
    navButton(el, 'Up').click();
    expect(seen).toEqual(['back', 'forward', 'up']);
  });

  it('a disabled one sends nothing', async () => {
    const el = await bar({ segments: PATH, canForward: true });
    const seen = heard();
    navButton(el, 'Back').click();
    navButton(el, 'Up').click();
    expect(seen).toEqual([]);
    navButton(el, 'Forward').click();
    expect(seen).toEqual(['forward']);
  });

  it('nor one the app has just turned off, before it is drawn disabled', async () => {
    // The button is redrawn a microtask after the property changes. A user's click cannot land
    // in that gap, but a script's click() in the same task does, and would ask the app for a move
    // it has just said it cannot make (Back past the start of its history).
    const el = await bar({ segments: PATH, canBack: true });
    const seen = heard();
    el.canBack = false;
    expect(navButton(el, 'Back').disabled).toBe(false);
    navButton(el, 'Back').click();
    expect(seen).toEqual([]);
    await el.updateComplete;
    expect(navButton(el, 'Back').disabled).toBe(true);
  });

  it('take can-back, can-forward and can-up as attributes too', async () => {
    document.body.innerHTML = '<dex-location-bar can-back can-up></dex-location-bar>';
    const el = document.querySelector('dex-location-bar')!;
    await el.updateComplete;
    expect([el.canBack, el.canForward, el.canUp]).toEqual([true, false, true]);
    expect(navButton(el, 'Back').disabled).toBe(false);
    expect(navButton(el, 'Forward').disabled).toBe(true);
    expect(navButton(el, 'Up').disabled).toBe(false);
  });
});

describe('the look a long path needs', () => {
  // happy-dom lays nothing out, so that a long path ends in an ellipsis rather than pushing the
  // bar wider is measured in a browser; what is pinned here is the rule that makes it so. Every
  // box between the bar and the label may shrink below its content (a flex item's min-width is
  // its content's by default, which would refuse), and the label clips with an ellipsis.
  it('lets each segment shrink, and clips its label with an ellipsis', async () => {
    const el = await bar({ segments: PATH });
    const label = getComputedStyle(segments(el)[1]!.querySelector('.label')!);
    expect(label.textOverflow).toBe('ellipsis');
    expect(label.whiteSpace).toBe('nowrap');
    expect(label.overflow).toBe('hidden');
    // A number, not 'auto' (NaN): happy-dom answers a zero length as '0'.
    const minWidth = (node: Element): number => parseFloat(getComputedStyle(node).minWidth);
    expect(minWidth(segments(el)[1]!.querySelector('.label')!)).toBe(0);
    expect(minWidth(segments(el)[1]!)).toBe(0);
    expect(minWidth(el.shadowRoot!.querySelectorAll('li')[1]!)).toBe(0);
    expect(minWidth(el.shadowRoot!.querySelector('.path')!)).toBe(0);
  });

  it('dims a button that cannot be used', async () => {
    const el = await bar();
    expect(getComputedStyle(navButton(el, 'Back')).opacity).toBe('0.35');
  });
});

describe('the look', () => {
  // The rules as text (happy-dom matches no :hover), comments taken out: a declaration a comment
  // quotes is no rule.
  const sheet = (): string =>
    [DexLocationBar.styles]
      .flat(Infinity)
      .map((s) => (s as { cssText: string }).cssText)
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ');
  // The declarations of the rule `selector` is one of the selectors of.
  const rule = (selector: string): string => {
    for (const [, selectors, body] of sheet().matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (selectors!.split(',').some((one) => one.trim() === selector)) return body!;
    }
    throw new Error(`no rule for ${selector}`);
  };

  it('fills Back, Forward and Up grey, darker under the pointer, so they read as buttons beside the path', async () => {
    // The bar is --dex-bg-secondary; the buttons a step darker, and a step more when hovered or
    // pressed, in each theme's own greys.
    const el = await bar({ canBack: true });
    expect(getComputedStyle(navButton(el, 'Back')).backgroundColor).toMatch(/^(#e8e8e8|rgb\(232, 232, 232\))$/);
    expect(rule('.go')).toContain('background: var(--dex-bg-hover, #e8e8e8)');
    expect(rule('.go:hover:not(:disabled)')).toContain('background: var(--dex-bg-active, #e0e0e0)');
    expect(rule('.go:active:not(:disabled)')).toContain('background: var(--dex-bg-active, #e0e0e0)');
    for (const [set, tokens] of Object.entries(THEME_SETS)) {
      const fills = ['--dex-bg-secondary', '--dex-bg-hover', '--dex-bg-active'].map((t) => tokens.get(t));
      expect(new Set(fills).size, set).toBe(3);
    }
  });

  it('sets the segments in a medium weight', async () => {
    const el = await bar({ segments: PATH });
    expect(getComputedStyle(segments(el)[1]!).fontWeight).toBe('500');
  });
});

describe('defineLocationBar', () => {
  it('registers the bar and the <dex-icon> it draws', () => {
    expect(customElements.get('dex-location-bar')).toBe(DexLocationBar);
    expect(customElements.get('dex-icon')).toBeDefined();
  });
});
