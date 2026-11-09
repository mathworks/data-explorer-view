// Copyright 2026 The MathWorks, Inc.

import { LitElement, html, css, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { defineElement } from '../../shared/define.js';
import { hiddenStyles } from '../../shared/hidden.styles.js';
import { buttonFocusRingStyles } from '../../shared/focus.styles.js';
import { highContrastStyles } from '../../shared/high-contrast.styles.js';

/** How much a line of the log matters. */
export type LogLevel = 'info' | 'warning' | 'error';

/** One line for the log, as the app hands it to appendEntry(). */
export interface LogEntry {
  /** How much it matters: the line's colour and its level word. A level not one of these is 'info'. */
  level: LogLevel;
  /** What happened, shown as text (a line break in it starts a new line). */
  message: string;
  /** When it happened. The time of the append when not given, or when it is no valid date. */
  at?: Date;
}

/**
 * Which lines are shown, by the least level: 'all' every line, 'warning' warnings and errors,
 * 'error' errors alone.
 */
export type LogFilter = 'all' | 'warning' | 'error';

/** What `dex-log-filter-changed` carries: the filter now shown. */
export interface LogFilterChangedDetail {
  filter: LogFilter;
}

/** A line as kept: the entry's level made known, and its time written once, when appended. */
interface Line {
  key: number;
  level: LogLevel;
  message: string;
  time: string;
  iso: string;
}

// A session that logs every edit for a day must not grow the page without end; a thousand lines
// is more than anyone scrolls back through, and what is older has been read or never will be.
const MAX_LINES = 1000;

const LEVELS: readonly LogLevel[] = ['info', 'warning', 'error'];

// The order the levels rank in, for the filter's "this level and above".
const RANK: Record<LogLevel, number> = { info: 0, warning: 1, error: 2 };

const FILTERS: readonly { value: LogFilter; label: string; none: string }[] = [
  { value: 'all', label: 'All', none: 'No log entries' },
  { value: 'warning', label: 'Warnings', none: 'No warnings or errors' },
  { value: 'error', label: 'Errors', none: 'No errors' },
];

// How far short of the bottom still counts as at it: a zoomed page scrolls in fractions of a
// pixel, and the last one is not always reached.
const BOTTOM_SLACK = 4;

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * The shell's Log, in the bottom panel: what the app did and what went wrong, a line each, oldest
 * first. appendEntry() adds a line (its time as HH:MM:SS, its level in words and in colour, its
 * message) and clear() takes them all away; the latest thousand are kept, the oldest dropped.
 *
 * A toolbar above the lines filters them by level (All, Warnings, Errors: a radio group, whose
 * arrow keys move and choose) and clears them. The filter narrows what is shown, never what is
 * kept, and is the `filter` property: the app may set it, and a choice in the toolbar sets it and
 * sends `dex-log-filter-changed`. Clear sends `dex-log-cleared`; clear() from the app sends
 * nothing.
 *
 * The lines are a log region (`role="log"`), which a screen reader reads out as lines arrive, and
 * a Tab stop, so the keyboard can scroll it. A change of filter marks the region busy until its
 * new lines are drawn, so they are not all read out. It keeps the newest line in view as lines
 * arrive, until the user scrolls up to read an older one; scrolled back to the bottom, it
 * follows again, as it does after a clear or a change of filter.
 * It fills the height it is given (a bottom panel's view) and scrolls the lines within it.
 *
 * @tagname dex-log-panel
 */
export class DexLogPanel extends LitElement {
  static override styles = [hiddenStyles, buttonFocusRingStyles, highContrastStyles, css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--dex-font-size, 13px);
      color: var(--dex-color-text, #333);
    }

    .toolbar {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
      border-bottom: 1px solid var(--dex-border-color-light, #e0e0e0);
    }

    .spacer {
      flex: 1 1 auto;
    }

    /* The Settings panel's segments, so the two radio groups of the shell look alike. Their own
       corners rather than the group's overflow: a clipped group would cut the focus ring off
       every segment, and the ring is the only sign of which one the arrow keys are on. */
    .segments {
      display: flex;
      border: 1px solid var(--dex-border-color, #d0d0d0);
      border-radius: 4px;
    }

    button {
      margin: 0;
      padding: 2px 10px;
      border: none;
      background: none;
      color: var(--dex-color-text, #333);
      font: inherit;
      font-size: 11px;
      cursor: pointer;
    }

    button:hover {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    .segments button {
      border-radius: 0;
    }

    .segments button + button {
      border-left: 1px solid var(--dex-border-color, #d0d0d0);
    }

    .segments button:first-child {
      border-radius: 3px 0 0 3px;
    }

    .segments button:last-child {
      border-radius: 0 3px 3px 0;
    }

    /* The ink is the panel's own surface, as in the Settings panel: white reads at 2.75:1 on the
       dark set's light accent, the surface at 6.1:1. */
    .segments button[aria-checked='true'] {
      background: var(--dex-color-accent, #0078d4);
      color: var(--dex-bg-primary, #fff);
    }

    /* Over its neighbours, so the ring is not painted under the next segment's surface. */
    .segments button:focus-visible {
      position: relative;
      z-index: 1;
    }

    .clear {
      border: 1px solid var(--dex-border-color, #d0d0d0);
      border-radius: 4px;
    }

    /* The prototype's log: mono, small, a line each, tight. The lines can be selected and
       copied, a message to quote in a bug report. */
    .lines {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: 4px 0;
      font-family: var(--dex-font-mono, 'SF Mono', 'Menlo', 'Monaco', monospace);
      font-size: 12px;
      line-height: 18px;
      outline: none;
    }

    .lines:focus-visible {
      box-shadow: inset var(--dex-focus-ring, 0 0 0 2px rgba(0, 120, 212, 0.4));
    }

    .line {
      display: flex;
      gap: 8px;
      padding: 1px 12px;
    }

    .time {
      flex: 0 0 auto;
      color: var(--dex-color-text-muted, #666);
    }

    /* As wide as the longest word, warning, so the messages start in one column. */
    .level {
      flex: 0 0 7ch;
      color: var(--dex-color-text-muted, #666);
    }

    /* A message can quote a path or a source's whole reason: it wraps anywhere rather than
       widening the panel, and keeps its own line breaks. */
    .message {
      flex: 1 1 auto;
      min-width: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .line.warning .level,
    .line.warning .message {
      color: var(--dex-color-warning, #d83b01);
    }

    .line.error .level,
    .line.error .message {
      color: var(--dex-color-error, #d32f2f);
    }

    .empty {
      padding: 4px 12px;
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      color: var(--dex-color-text-muted, #666);
    }

    /* Forced colours repaint every surface alike, which would leave the chosen segment looking
       like the others: the system's own selection colours keep it apart. */
    @media (forced-colors: active) {
      .segments button[aria-checked='true'] {
        forced-color-adjust: none;
        background: Highlight;
        color: HighlightText;
      }
    }
  `];

  /**
   * Which lines are shown, by the least level: `all` (the default), `warning` (warnings and
   * errors) or `error`. A choice in the toolbar sets it and sends `dex-log-filter-changed`; set
   * by the app it sends nothing. A value not one of these is `all`. Attribute `filter`.
   */
  @property({ type: String, reflect: true }) filter: LogFilter = 'all';

  // Oldest first.
  @state() private _lines: Line[] = [];
  private _nextKey = 0;
  // Whether the view keeps the newest line in sight: true while it is at the bottom, decided
  // before each render from where the view is and kept for a resize between renders.
  private _follow = true;
  // Set by clear(): the next render follows the newest line whatever the view's position, since
  // the lines it was among are gone. A change of filter does the same.
  private _toNewest = false;
  private _resize: ResizeObserver | null = null;
  // The frame that ends a busy region, while one is pending.
  private _busyFrame: number | null = null;

  /**
   * Adds a line at the bottom, dropping the oldest once there are a thousand. Its time is the
   * entry's `at`, or now; its level is the entry's, or 'info' for one not known. Not `append`:
   * that is the DOM's own, which puts nodes in the element.
   */
  appendEntry(entry: LogEntry): void {
    const level = LEVELS.includes(entry.level) ? entry.level : 'info';
    const given = entry.at;
    const at = given instanceof Date && !Number.isNaN(given.getTime()) ? given : new Date();
    const line: Line = {
      key: this._nextKey++,
      level,
      message: entry.message,
      time: `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`,
      iso: at.toISOString(),
    };
    const lines = [...this._lines, line];
    this._lines = lines.length > MAX_LINES ? lines.slice(lines.length - MAX_LINES) : lines;
  }

  /** Takes every line away, sending nothing. */
  clear(): void {
    this._lines = [];
    this._toNewest = true;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Back on the page after leaving it, the lines are drawn already, and need watching again.
    if (this.hasUpdated) this._observe();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resize?.disconnect();
    this._resize = null;
    // Off the page no frame need end the busy state: it ends now, and the panel put back on the
    // page is not left with a region that says it is never done.
    this._endBusy();
  }

  protected override firstUpdated(): void {
    this._observe();
  }

  // Before the new lines are drawn, where the view is decides whether they are followed: a
  // browser reports a scroll in its next frame, so a user who has just scrolled up (or back
  // down) and lines arriving in the same frame would otherwise be judged by where the view was
  // before. Hidden (no box), the view is nowhere, and the last decision stands.
  protected override willUpdate(changed: PropertyValues<this>): void {
    const lines = this._linesBox();
    const refiltered = changed.has('filter') && this.hasUpdated;
    if (this._toNewest || refiltered) {
      this._follow = true;
      this._toNewest = false;
    } else if (lines && lines.clientHeight > 0) {
      this._follow = this._atBottom(lines);
    }
    if (lines && refiltered) this._beginBusy(lines);
  }

  protected override updated(): void {
    if (this._follow) this._toBottom();
  }

  // A box that changes size moves the bottom: a panel dragged taller, or shown again after it was
  // hidden, when it had no box to scroll and the lines appended meanwhile went below the fold.
  private _observe(): void {
    const lines = this._linesBox();
    if (!lines || typeof ResizeObserver === 'undefined') return;
    this._resize?.disconnect();
    this._resize = new ResizeObserver(() => {
      if (this._follow) this._toBottom();
    });
    this._resize.observe(lines);
  }

  private _linesBox(): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>('.lines');
  }

  // The browser stops at the last line however far past it this asks.
  private _toBottom(): void {
    const lines = this._linesBox();
    if (lines) lines.scrollTop = lines.scrollHeight;
  }

  private _atBottom(lines: HTMLElement): boolean {
    return lines.scrollHeight - lines.scrollTop - lines.clientHeight <= BOTTOM_SLACK;
  }

  // The user's scroll, and the panel's own to the bottom, which lands where following goes on:
  // what a resize between renders goes by.
  private _onScroll(): void {
    const lines = this._linesBox();
    if (lines) this._follow = this._atBottom(lines);
  }

  // A change of filter replaces up to a thousand lines of a log region at once, and a screen
  // reader would read every line added. aria-busy asks it to wait; it is set before the render
  // and taken away a frame after it, once the new lines are in the page, rather than in the same
  // task, where nothing would ever see it set. Set on the element and not in the template, so
  // ending it does not draw the thousand lines again.
  private _beginBusy(lines: HTMLElement): void {
    lines.setAttribute('aria-busy', 'true');
    if (this._busyFrame !== null) cancelAnimationFrame(this._busyFrame);
    this._busyFrame = requestAnimationFrame(() => {
      this._busyFrame = null;
      lines.removeAttribute('aria-busy');
    });
  }

  private _endBusy(): void {
    if (this._busyFrame !== null) cancelAnimationFrame(this._busyFrame);
    this._busyFrame = null;
    this._linesBox()?.removeAttribute('aria-busy');
  }

  private _shownFilter(): LogFilter {
    return FILTERS.some((f) => f.value === this.filter) ? this.filter : 'all';
  }

  // A notification, and only for a change: as a radio button sends nothing when it is already
  // the one checked.
  private _choose(filter: LogFilter): void {
    if (this._shownFilter() === filter) return;
    this.filter = filter;
    this.dispatchEvent(new CustomEvent<LogFilterChangedDetail>('dex-log-filter-changed', {
      detail: { filter },
      bubbles: true,
      composed: true,
    }));
  }

  private _onClear(): void {
    this.clear();
    this.dispatchEvent(new CustomEvent<null>('dex-log-cleared', { bubbles: true, composed: true }));
  }

  // The arrows move and choose, as in a group of radio buttons, wrapping at the ends, from the
  // focused segment. With a modifier held the key is someone else's (a shell chord), and left alone.
  private _onFilterKey(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const radios = Array.from(this.renderRoot.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    const focused = radios.indexOf(this.shadowRoot!.activeElement as HTMLButtonElement);
    const from = focused >= 0 ? focused : FILTERS.findIndex((f) => f.value === this._shownFilter());
    const to = (from + step + FILTERS.length) % FILTERS.length;
    radios[to]?.focus();
    this._choose(FILTERS[to]!.value);
  }

  override render() {
    const filter = this._shownFilter();
    const least = filter === 'all' ? 0 : RANK[filter];
    const shown = least === 0 ? this._lines : this._lines.filter((line) => RANK[line.level] >= least);
    const none = FILTERS.find((f) => f.value === filter)!.none;

    return html`
      <div class="toolbar">
        <div class="segments" role="radiogroup" aria-label="Show" @keydown=${this._onFilterKey}>
          ${FILTERS.map((f) => html`
            <button
              type="button"
              role="radio"
              aria-checked=${f.value === filter ? 'true' : 'false'}
              tabindex=${f.value === filter ? '0' : '-1'}
              @click=${() => this._choose(f.value)}
            >${f.label}</button>
          `)}
        </div>
        <span class="spacer"></span>
        <button type="button" class="clear" @click=${this._onClear}>Clear</button>
      </div>
      <div class="lines" role="log" aria-label="Log" tabindex="0" @scroll=${this._onScroll}>
        ${shown.length === 0
          ? html`<div class="empty">${this._lines.length === 0 ? FILTERS[0]!.none : none}</div>`
          : repeat(shown, (line) => line.key, (line) => html`
            <div class="line ${line.level}">
              <time class="time" datetime=${line.iso}>${line.time}</time>
              <span class="level">${line.level}</span>
              <span class="message">${line.message}</span>
            </div>
          `)}
      </div>
    `;
  }
}

/** Registers the widget as `<dex-log-panel>`, or under `tag`. */
export function defineLogPanel(tag = 'dex-log-panel'): void {
  defineElement(tag, DexLogPanel);
}

/**
 * The events `<dex-log-panel>` sends, by name. They bubble and are composed, so they reach the document
 * and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend this map,
 * and a listener on an element, the document or the window is typed.
 */
export interface LogPanelEventMap {
  /** The user chose another level in the toolbar; `filter` is set to it already. Keep it, if the app keeps such things. */
  'dex-log-filter-changed': CustomEvent<LogFilterChangedDetail>;
  /** The user pressed Clear, and every line is gone. No detail. */
  'dex-log-cleared': CustomEvent<null>;
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-log-panel': DexLogPanel;
  }
  interface HTMLElementEventMap extends LogPanelEventMap {}
  interface DocumentEventMap extends LogPanelEventMap {}
  interface WindowEventMap extends LogPanelEventMap {}
}
