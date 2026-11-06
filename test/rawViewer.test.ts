// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// <dex-raw-viewer>: the Raw pane, which draws the RawView an app hands it (`TableSource.raw`'s
// answer for the selected row) and asks the app to copy it. What it promises is what the user
// reads and takes away: the text exactly as given (its first megabyte, of a longer one) or the hex
// dump of the bytes, coloured by the tokenizers and never parsed as markup, a badge naming what it is, a Copy button whose request
// carries the whole text shown, the reason when there is nothing to show, and a note when no row
// is selected or the answer is on its way.
//
// happy-dom applies no stylesheet, so the colours are pinned by the token classes the text is
// drawn in, and the theme tokens each class reads by the stylesheet's text.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  DexRawViewer,
  RAW_DRAW_LIMIT,
  RAW_HIGHLIGHT_LIMIT,
  defineRawViewer,
  type RawCopyDetail,
} from '../src/widgets/app-shell/modules/dex-raw-viewer.js';
import { formatHex, type RawView } from '../src/model/raw/rawView.js';

beforeAll(() => defineRawViewer());
afterEach(() => document.body.replaceChildren());

async function viewer(raw: RawView | null, init: (el: DexRawViewer) => void = () => {}): Promise<DexRawViewer> {
  const el = document.createElement('dex-raw-viewer');
  el.raw = raw;
  init(el);
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const $ = (el: DexRawViewer, sel: string): HTMLElement | null => el.shadowRoot!.querySelector<HTMLElement>(sel);
const pre = (el: DexRawViewer): HTMLElement | null => $(el, 'pre');
const note = (el: DexRawViewer): string | undefined => $(el, '.note')?.textContent?.trim();
const copyButton = (el: DexRawViewer): HTMLButtonElement | null => el.shadowRoot!.querySelector<HTMLButtonElement>('button.copy');
// The coloured runs of the text, as `class:text`.
const coloured = (el: DexRawViewer): string[] => [...pre(el)!.querySelectorAll('span')].map((s) => `${s.className}:${s.textContent}`);

// Every dex-raw-copy that reaches the document, as an app listening there would hear it.
function copies(): CustomEvent<RawCopyDetail>[] {
  const heard: CustomEvent<RawCopyDetail>[] = [];
  document.addEventListener('dex-raw-copy', (e) => heard.push(e));
  return heard;
}

describe('the text', () => {
  it('draws JSON as given, its keys, strings, numbers and literals coloured', async () => {
    const text = '{\n  "name": "Kp",\n  "value": 1.5,\n  "ok": true\n}';
    const el = await viewer({ format: 'json', text });
    expect(pre(el)!.textContent).toBe(text);
    expect(coloured(el)).toEqual(['t-key:"name"', 't-string:"Kp"', 't-key:"value"', 't-number:1.5', 't-key:"ok"', 't-literal:true']);
    expect($(el, '.badge')!.textContent).toBe('JSON');
  });

  it('draws XML as given, its tags, attributes, values and comments coloured', async () => {
    const text = '<!-- one -->\n<P Name="Value" Class="double">1.0</P>';
    const el = await viewer({ format: 'xml', text });
    expect(pre(el)!.textContent).toBe(text);
    expect(coloured(el)).toEqual([
      't-comment:<!-- one -->', 't-tag:P', 't-attr:Name', 't-string:"Value"', 't-attr:Class', 't-string:"double"', 't-tag:P',
    ]);
    expect($(el, '.badge')!.textContent).toBe('XML');
  });

  it('draws plain text, and a value\'s bytes as a hex dump, uncoloured', async () => {
    const text = await viewer({ format: 'text', text: '[object Object]' });
    expect(pre(text)!.textContent).toBe('[object Object]');
    expect(coloured(text)).toEqual([]);
    expect($(text, '.badge')!.textContent).toBe('Text');

    const bytes = new Uint8Array([0x0e, 0, 0, 0, 0x68, 0, 0, 0, 0x41, 0x42]);
    const hex = await viewer({ format: 'hex', bytes });
    expect(pre(hex)!.textContent).toBe(formatHex(bytes));
    expect(coloured(hex)).toEqual([]);
    expect($(hex, '.badge')!.textContent).toBe('Hex');
  });

  it('draws the text as text, never as markup', async () => {
    const text = '{"a": "<img src=x onerror=alert(1)>"}';
    const el = await viewer({ format: 'json', text });
    expect(el.shadowRoot!.querySelector('img')).toBeNull();
    expect(pre(el)!.textContent).toBe(text);
    const xml = await viewer({ format: 'xml', text: '<script>alert(1)</script>' });
    expect(xml.shadowRoot!.querySelector('script')).toBeNull();
    expect(pre(xml)!.textContent).toBe('<script>alert(1)</script>');
  });

  it('draws a text past the highlight limit uncoloured, all of it while it is under the draw limit', async () => {
    const text = `[${'1,'.repeat(RAW_HIGHLIGHT_LIMIT / 2)}1]`;
    expect(text.length).toBeLessThan(RAW_DRAW_LIMIT);
    const el = await viewer({ format: 'json', text });
    expect(pre(el)!.textContent).toBe(text);
    expect(coloured(el)).toEqual([]);
  });

  it('draws the first megabyte of a longer text, to the end of a line, and says how much it left out', async () => {
    expect(RAW_DRAW_LIMIT).toBe(1024 * 1024);
    const line = `${'x'.repeat(99)}\n`;
    const text = line.repeat(RAW_DRAW_LIMIT / 100 + 50);
    const el = await viewer({ format: 'text', text });
    const drawn = pre(el)!.textContent!;
    const shown = Math.floor(RAW_DRAW_LIMIT / 100) * 100;
    expect(drawn).toBe(`${text.slice(0, shown)}… ${(text.length - shown).toLocaleString('en-US')} more characters`);
    expect(drawn.length).toBeLessThan(RAW_DRAW_LIMIT + 100);
  });

  it('cuts a longer text of one line at the limit, never inside a character', async () => {
    // A long chunk can be one line; an emoji is two UTF-16 units, which the cut keeps together.
    const text = `${'a'.repeat(RAW_DRAW_LIMIT - 1)}😀${'b'.repeat(10)}`;
    const el = await viewer({ format: 'xml', text });
    const drawn = pre(el)!.textContent!;
    expect(drawn).toBe(`${'a'.repeat(RAW_DRAW_LIMIT - 1)}\n… 11 more characters`);
  });

  it('draws each coloured token as a span with its text, and every run between them as one text', async () => {
    const el = await viewer({ format: 'json', text: '{"a": 1, "b": true}' });
    const nodes = [...pre(el)!.childNodes].filter((n) => n.nodeType !== Node.COMMENT_NODE && n.textContent !== '');
    expect(nodes.map((n) => (n.nodeType === Node.TEXT_NODE ? `text:${n.textContent}` : `${(n as Element).className}:${n.textContent}`))).toEqual([
      'text:{', 't-key:"a"', 'text:: ', 't-number:1', 'text:, ', 't-key:"b"', 'text:: ', 't-literal:true', 'text:}',
    ]);
    // A span holds its text alone, with no marker beside it.
    for (const span of pre(el)!.querySelectorAll('span')) expect(span.childNodes).toHaveLength(1);
  });

  it('keeps what it drew when the same answer comes again', async () => {
    const text = '{\n  "a": [1, 2, 3]\n}';
    const el = await viewer({ format: 'json', text });
    const shown = (el as unknown as { _shown: unknown })._shown;
    const span = pre(el)!.querySelector('span');
    // A new RawView of the same text, as a source's next answer for the same row is.
    el.raw = { format: 'json', text: `${text}` };
    await el.updateComplete;
    expect((el as unknown as { _shown: unknown })._shown).toBe(shown);
    expect(pre(el)!.querySelector('span')).toBe(span);
    const bytes = new Uint8Array([1, 2]);
    el.raw = { format: 'hex', bytes };
    await el.updateComplete;
    const dump = (el as unknown as { _shown: unknown })._shown;
    el.raw = { format: 'hex', bytes };
    await el.updateComplete;
    expect((el as unknown as { _shown: unknown })._shown).toBe(dump);
  });

  it('is a region the keyboard can scroll, named for what it shows', async () => {
    const el = await viewer({ format: 'json', text: '{}' });
    expect(pre(el)!.getAttribute('tabindex')).toBe('0');
    expect(pre(el)!.getAttribute('aria-label')).toBe('Raw data, JSON');
  });

  it('colours each kind of token with its syntax token, and lets the text be selected', () => {
    const css = [DexRawViewer.styles].flat(Infinity).map((s) => (s as { cssText: string }).cssText).join('\n').replace(/\s+/g, ' ');
    for (const [kind, token] of [
      ['key', 'keyword'], ['string', 'string'], ['number', 'number'], ['literal', 'literal'],
      ['tag', 'keyword'], ['attr', 'title'], ['comment', 'comment'],
    ]) {
      expect(css, kind).toMatch(new RegExp(`\\.t-${kind} \\{ color: var\\(--dex-syntax-${token},`));
    }
    expect(css).toMatch(/pre \{[^}]*user-select: text;/);
  });

  it('draws the next answer in place of the last', async () => {
    const el = await viewer({ format: 'json', text: '1' });
    el.raw = { format: 'xml', text: '<a/>' };
    await el.updateComplete;
    expect(pre(el)!.textContent).toBe('<a/>');
    expect($(el, '.badge')!.textContent).toBe('XML');
  });
});

describe('Copy', () => {
  it('asks for the whole text, where the pane draws only the first megabyte of it', async () => {
    const heard = copies();
    const text = 'y'.repeat(RAW_DRAW_LIMIT + 5);
    const el = await viewer({ format: 'text', text });
    expect(pre(el)!.textContent!.endsWith('… 5 more characters')).toBe(true);
    copyButton(el)!.click();
    expect(heard).toHaveLength(1);
    expect(heard[0]!.detail.text).toBe(text);
  });

  it('asks the app to copy the text shown, and copies nothing itself', async () => {
    const heard = copies();
    const text = '{\n  "a": 1\n}';
    const el = await viewer({ format: 'json', text });
    copyButton(el)!.click();
    expect(heard).toHaveLength(1);
    expect(heard[0]!.detail).toEqual({ text });
    expect(heard[0]!.bubbles).toBe(true);
    expect(heard[0]!.composed).toBe(true);
    expect(copyButton(el)!.textContent!.trim()).toBe('Copy');
  });

  it('asks for the hex dump of bytes, as shown', async () => {
    const heard = copies();
    const bytes = new Uint8Array([1, 2, 3]);
    const el = await viewer({ format: 'hex', bytes });
    copyButton(el)!.click();
    expect(heard.map((e) => e.detail.text)).toEqual([formatHex(bytes)]);
  });
});

describe('when there is nothing to show', () => {
  it('asks for a selection when it has no answer', async () => {
    const el = await viewer(null);
    expect(note(el)).toBe('Select an entry to see its raw data.');
    expect(pre(el)).toBeNull();
    expect(copyButton(el)).toBeNull();
  });

  it('says why a row has no raw form, with nothing to copy', async () => {
    const el = await viewer({ format: 'none', reason: 'No raw data for this row.' });
    expect(note(el)).toBe('No raw data for this row.');
    expect(pre(el)).toBeNull();
    expect(copyButton(el)).toBeNull();
  });

  it('says the answer is on its way while loading, in place of the last one', async () => {
    const el = await viewer({ format: 'json', text: '1' }, (v) => (v.loading = true));
    expect(note(el)).toBe('Loading…');
    expect($(el, '.note')!.getAttribute('role')).toBe('status');
    expect(pre(el)).toBeNull();
    expect(copyButton(el)).toBeNull();
    el.loading = false;
    await el.updateComplete;
    expect(pre(el)!.textContent).toBe('1');
  });

  it('takes loading from its attribute', async () => {
    const el = await viewer(null, (v) => v.setAttribute('loading', ''));
    expect(el.loading).toBe(true);
    expect(note(el)).toBe('Loading…');
  });
});
