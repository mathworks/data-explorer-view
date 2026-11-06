// Copyright 2026 The MathWorks, Inc.

import { LitElement, html, css, type PropertyValues } from 'lit';
import { property } from 'lit/decorators.js';
import { defineElement } from '../../shared/define.js';
import { defineIcon } from '../../shared/dex-icon.js';
import { hiddenStyles } from '../../shared/hidden.styles.js';
import { buttonFocusRingStyles, tabindexFocusRingStyles } from '../../shared/focus.styles.js';
import { highContrastStyles } from '../../shared/high-contrast.styles.js';
import { formatHex, tokenizeJson, tokenizeXml, type RawToken, type RawView } from '../../../model/raw/rawView.js';

/** What `dex-raw-copy` carries: the whole text the pane shows, which the app puts on the clipboard. */
export interface RawCopyDetail {
  text: string;
}

/**
 * The longest JSON or XML text the pane colours, in characters: a longer one is drawn as plain
 * text. A span per token of a record of megabytes would take the page longer to lay out than the
 * record takes to read.
 */
export const RAW_HIGHLIGHT_LIMIT = 256 * 1024;

/**
 * How much of a text the pane draws, in characters: 1 MB, then a line saying how much more there
 * is, as the hex dump stops at 64 KB. Copy sends the whole text all the same.
 */
export const RAW_DRAW_LIMIT = 1024 * 1024;

/** The badge over each format. */
const BADGES: Record<Exclude<RawView['format'], 'none'>, string> = { json: 'JSON', xml: 'XML', text: 'Text', hex: 'Hex' };

/** What the pane draws for a RawView with something to show, worked out once for it. */
interface Shown {
  format: Exclude<RawView['format'], 'none'>;
  /** The whole text, as Copy sends it: the dump, for bytes. */
  text: string;
  /** What the block draws of it: the text, cut at the draw limit, or its runs, where it is coloured. */
  body: string | unknown[];
  /** The answer it was made from, to know the same answer when it comes again. */
  from: RawView;
}

/** Whether two answers say the same: the same text in the same format, or the same bytes. */
function sameAnswer(a: RawView, b: RawView): boolean {
  if (a.format === 'hex' || b.format === 'hex') return a.format === b.format && (a as { bytes: unknown }).bytes === (b as { bytes: unknown }).bytes;
  if (a.format === 'none' || b.format === 'none') return false;
  return a.format === b.format && a.text === b.text;
}

const isHighSurrogate = (unit: number): boolean => unit >= 0xd800 && unit <= 0xdbff;

/** How many characters `text` holds from `from` on, a pair of UTF-16 surrogates being one. */
function charactersFrom(text: string, from: number): number {
  let n = text.length - from;
  for (let i = from; i + 1 < text.length; i++) if (isHighSurrogate(text.charCodeAt(i)) && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) n--;
  return n;
}

/**
 * The part of `text` the block draws: all of it within RAW_DRAW_LIMIT, else up to the end of the
 * last line that fits (where that is past half the limit; a chunk of XML can be one line) or the
 * limit itself, never between the two halves of a character, then a line saying how many more
 * characters there are.
 */
function drawnPart(text: string): string {
  if (text.length <= RAW_DRAW_LIMIT) return text;
  let end = text.lastIndexOf('\n', RAW_DRAW_LIMIT - 1) + 1;
  if (end <= RAW_DRAW_LIMIT / 2) {
    end = RAW_DRAW_LIMIT;
    if (isHighSurrogate(text.charCodeAt(end - 1))) end--;
  }
  const more = charactersFrom(text, end);
  return `${text.slice(0, end)}${text[end - 1] === '\n' ? '' : '\n'}… ${more.toLocaleString('en-US')} more ${more === 1 ? 'character' : 'characters'}`;
}

/**
 * The tokens as the block draws them: each coloured one a span of its class, and every run of the
 * others between them (punctuation, whitespace, an element's content) one text. The span's text is
 * its `textContent`, not a child of its template, which would add a marker beside each one; the
 * page holds a few nodes per coloured token and no more. Lit sets both as text, so nothing in a
 * record is markup.
 */
function runsOf(tokens: RawToken[]): unknown[] {
  const runs: unknown[] = [];
  let plain = '';
  for (const t of tokens) {
    if (t.kind === 'text' || t.kind === 'punct') {
      plain += t.text;
      continue;
    }
    if (plain) runs.push(plain);
    plain = '';
    runs.push(html`<span class=${`t-${t.kind}`} .textContent=${t.text}></span>`);
  }
  if (plain) runs.push(plain);
  return runs;
}

function shownOf(raw: RawView | null): Shown | null {
  if (!raw || raw.format === 'none') return null;
  if (raw.format === 'hex') {
    const dump = formatHex(raw.bytes);
    return { format: 'hex', text: dump, body: dump, from: raw };
  }
  // An app's data, which nothing checks as it runs: a text that is not a string is shown as one.
  const text = typeof raw.text === 'string' ? raw.text : String(raw.text);
  if (raw.format === 'text' || text.length > RAW_HIGHLIGHT_LIMIT) return { format: raw.format, text, body: drawnPart(text), from: raw };
  const tokens = raw.format === 'json' ? tokenizeJson(text) : tokenizeXml(text);
  return { format: raw.format, text, body: runsOf(tokens), from: raw };
}

/**
 * The Raw pane: what the file holds for the selected row, unrendered, as `TableSource.raw`
 * answers it. A JSON or XML text is coloured (keys, strings, numbers, tags, attributes, comments,
 * each with its `--dex-syntax-*` token), a value's bytes are a hex dump, and either is drawn in a
 * monospaced, scrollable, selectable block under a header naming its format. The text is drawn as
 * text, never as markup, and its first megabyte alone (RAW_DRAW_LIMIT), then a line saying how
 * much more there is.
 *
 * Copy sends `dex-raw-copy` with the whole text (the dump, for bytes): the app puts it on the
 * clipboard, as only it may. A RawView with nothing to show draws its reason as a muted note; no
 * RawView at all (`raw` null), a note asking for a selection; and `loading`, a note that the answer
 * is on its way, in place of the last one. The pane knows nothing of documents: the app hands it
 * each answer.
 *
 * @tagname dex-raw-viewer
 */
export class DexRawViewer extends LitElement {
  static override styles = [hiddenStyles, buttonFocusRingStyles, tabindexFocusRingStyles, highContrastStyles, css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      background: var(--dex-bg-primary, #fff);
      color: var(--dex-color-text, #333);
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--dex-font-size, 13px);
    }

    .header {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      border-bottom: 1px solid var(--dex-border-color-light, #e0e0e0);
    }

    .badge {
      padding: 1px 6px;
      border-radius: 3px;
      background: var(--dex-bg-badge, rgba(128, 128, 128, 0.18));
      color: var(--dex-color-text-secondary, #555);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.04em;
    }

    .spacer {
      flex: 1;
    }

    button {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 22px;
      padding: 0 8px;
      border: 1px solid var(--dex-border-color, #d0d0d0);
      border-radius: 3px;
      background: var(--dex-bg-primary, #fff);
      color: inherit;
      font: inherit;
      font-size: 11px;
      cursor: pointer;
    }

    button:hover {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    button:active {
      background: var(--dex-bg-active, #e0e0e0);
    }

    /* Selectable, whatever the page around says: copying a part of a record is what the pane is
       for. Lines are not wrapped, so a dump's columns and a record's indent stay in line, and the
       block scrolls both ways instead. */
    pre {
      flex: 1 1 auto;
      min-height: 0;
      margin: 0;
      padding: 8px;
      overflow: auto;
      font-family: var(--dex-font-mono, 'SF Mono', 'Menlo', 'Monaco', monospace);
      font-size: 12px;
      line-height: 1.5;
      white-space: pre;
      tab-size: 2;
      user-select: text;
      cursor: text;
    }

    /* VS Code's light colours for JSON and XML: a key and a tag in the keyword's blue, as a literal
       is, and an attribute in the title's brown. Not --dex-syntax-meta, whose light value is under
       4.5:1 on white. */
    .t-key { color: var(--dex-syntax-keyword, #0451a5); }
    .t-string { color: var(--dex-syntax-string, #a31515); }
    .t-number { color: var(--dex-syntax-number, #098658); }
    .t-literal { color: var(--dex-syntax-literal, #0451a5); }
    .t-tag { color: var(--dex-syntax-keyword, #0451a5); }
    .t-attr { color: var(--dex-syntax-title, #795e26); }
    .t-comment { color: var(--dex-syntax-comment, #008000); font-style: italic; }

    .note {
      padding: 12px;
      color: var(--dex-color-text-muted, #666);
      font-size: 12px;
      line-height: 1.4;
    }

    /* Faded in after a moment, as the table's Loading… is: an answer that comes at once never
       shows it. */
    .loading {
      animation: dex-raw-loading-in 120ms ease-out 300ms both;
    }

    @keyframes dex-raw-loading-in {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
  `];

  /**
   * What to show: `TableSource.raw`'s answer for the selected row. Null, the default, is no
   * selection, and draws a note asking for one. Property only.
   */
  @property({ attribute: false }) raw: RawView | null = null;
  /**
   * The answer for a new selection is on its way: the pane says Loading… in place of the last one,
   * which is no longer the selection's. Set it while `raw()` is asked. Default false. Attribute
   * `loading`.
   */
  @property({ type: Boolean }) loading = false;

  // What `raw` draws as, worked out once for each answer rather than on every render: a dump and
  // the tokens of a long record are the costly part. A source asked again for the same row answers
  // a new RawView of the same text (or the same bytes), which keeps what was drawn.
  private _shown: Shown | null = null;

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has('raw')) return;
    if (this._shown && this.raw && sameAnswer(this._shown.from, this.raw)) return;
    this._shown = shownOf(this.raw);
  }

  private _copy(text: string): void {
    this.dispatchEvent(new CustomEvent<RawCopyDetail>('dex-raw-copy', {
      detail: { text },
      bubbles: true,
      composed: true,
    }));
  }

  // The text as runs: a coloured token in a span of its class, whitespace, punctuation and
  // content as the text they are. Lit sets each run as text, so nothing in a record is markup.
  override render() {
    if (this.loading) return html`<div class="note loading" role="status">Loading…</div>`;
    const shown = this._shown;
    if (!shown) {
      const reason = this.raw?.format === 'none' ? this.raw.reason : 'Select an entry to see its raw data.';
      return html`<div class="note">${reason}</div>`;
    }
    const badge = BADGES[shown.format];
    return html`
      <div class="header">
        <span class="badge">${badge}</span>
        <span class="spacer"></span>
        <button type="button" class="copy" title="Copy the raw data" @click=${() => this._copy(shown.text)}>
          <dex-icon .iconId=${'copy'} .size=${14}></dex-icon>
          <span>Copy</span>
        </button>
      </div>
      <pre tabindex="0" aria-label=${`Raw data, ${badge}`}>${shown.body}</pre>
    `;
  }
}

/** Registers the widget as `<dex-raw-viewer>`, or under `tag`, and the `<dex-icon>` its Copy button draws. */
export function defineRawViewer(tag = 'dex-raw-viewer'): void {
  defineIcon();
  defineElement(tag, DexRawViewer);
}

/**
 * The events `<dex-raw-viewer>` sends, by name. They bubble and are composed, so they reach the
 * document and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend
 * this map, and a listener on an element, the document or the window is typed.
 */
export interface RawViewerEventMap {
  /**
   * Copy was pressed: put `text`, the whole text the pane shows (past what it draws of a long one;
   * a value's hex dump, for its bytes), on the clipboard. A request: the pane copies nothing itself.
   */
  'dex-raw-copy': CustomEvent<RawCopyDetail>;
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-raw-viewer': DexRawViewer;
  }
  interface HTMLElementEventMap extends RawViewerEventMap {}
  interface DocumentEventMap extends RawViewerEventMap {}
  interface WindowEventMap extends RawViewerEventMap {}
}
