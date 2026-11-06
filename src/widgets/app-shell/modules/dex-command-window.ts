// Copyright 2026 The MathWorks, Inc.

import { LitElement, html, css, type PropertyValues } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { defineElement } from '../../shared/define.js';
import { hiddenStyles } from '../../shared/hidden.styles.js';
import { highContrastStyles } from '../../shared/high-contrast.styles.js';
import type { CommandOutput, OutputLine } from '../../../model/shell/commands.js';

/** What `dex-command-run` carries: the line typed at the prompt, without the spaces around it. */
export interface CommandRunDetail {
  line: string;
}

// A line of the output: a line of an answer, in its kind, or a line run, shown after the prompt.
// The welcome's first line is drawn from `heading` (`heading: true`), whenever that is set.
interface WindowLine {
  text: string;
  kind: OutputLine['kind'] | 'input';
  heading?: true;
}

const KINDS: ReadonlySet<string> = new Set(['out', 'error', 'info']);

// What the window says before anything is run, as the prototype's said it, naming the app.
const WELCOME: readonly WindowLine[] = [
  { text: '', kind: 'out', heading: true },
  { text: 'Type "help" for available commands.', kind: 'out' },
];

const DEFAULT_MAX_LINES = 5000;
// The most lines the arrows recall; past it the oldest is forgotten.
const HISTORY_LIMIT = 200;

/**
 * A MATLAB-style command window: the output of the commands run so far over a `>>` prompt. It runs
 * nothing itself. Enter shows the line after the prompt, keeps it in the history and sends
 * `dex-command-run`; the app runs the line (the model's runCommand, over its documents) and hands
 * the answer to `appendOutput()`, whose lines are drawn as text in their kind's colour (output, an
 * error, a note). ArrowUp and ArrowDown recall the lines run, newest first, only those beginning
 * with what is typed when there is something typed, as MATLAB's do; Escape empties the prompt. The
 * output keeps its newest `maxLines` lines, and scrolls to the newest.
 *
 * @tagname dex-command-window
 */
export class DexCommandWindow extends LitElement {
  static override styles = [hiddenStyles, highContrastStyles, css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      box-sizing: border-box;
      background: var(--dex-bg-primary, #fff);
      color: var(--dex-color-text, #333);
      font-family: var(--dex-font-mono, 'SF Mono', 'Menlo', 'Monaco', monospace);
      font-size: 12px;
    }

    /* The output takes what the prompt leaves, and scrolls: min-height:0 lets it be shorter than
       its lines (a flex item is otherwise never smaller than its content). A text cursor, since a
       click in it puts the caret at the prompt. */
    .output {
      flex: 1 1 0;
      min-height: 0;
      overflow-y: auto;
      padding: 4px 8px;
      cursor: text;
    }

    /* Inset: the panel around the window clips what is drawn outside it. */
    .output:focus-visible {
      outline: none;
      box-shadow: inset var(--dex-focus-ring, 0 0 0 2px rgba(0, 120, 212, 0.4));
    }

    /* Each line as it was given, its spaces kept (the columns of a listing line up on them) and
       wrapped where it is longer than the window. A blank line keeps its height. */
    .line {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      line-height: 1.4;
      min-height: 1.4em;
    }

    .line.input {
      color: var(--dex-color-accent, #0078d4);
    }

    .line.error {
      color: var(--dex-color-error, #d32f2f);
    }

    .line.info {
      color: var(--dex-color-text-muted, #666);
    }

    .prompt-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-top: 1px solid var(--dex-border-color-light, #e0e0e0);
    }

    /* The prompt has no box of its own to ring, so the line above it says it has the keyboard. */
    .prompt-row:focus-within {
      border-top-color: var(--dex-color-accent, #0078d4);
    }

    .prompt {
      flex-shrink: 0;
      color: var(--dex-color-accent, #0078d4);
      user-select: none;
    }

    input {
      flex: 1;
      min-width: 0;
      margin: 0;
      padding: 2px 0;
      border: none;
      outline: none;
      background: transparent;
      color: inherit;
      font: inherit;
    }
  `];

  /**
   * The most lines the output keeps; past it the oldest go, so a long session does not grow the
   * page without bound. Default 5000. Attribute `max-lines`.
   */
  @property({ type: Number, attribute: 'max-lines' }) maxLines = DEFAULT_MAX_LINES;

  /**
   * The app the welcome's first line names, "<heading> — Command Window". Default 'Data Explorer'.
   * Attribute `heading`.
   */
  @property() heading = 'Data Explorer';

  @state() private _lines: WindowLine[] = [...WELCOME];

  // The lines run, oldest first; where the arrows are among them (`_history.length` is the prompt
  // itself); and what was typed before the first arrow, which the arrows match and give back.
  private _history: string[] = [];
  private _at = 0;
  private _draft = '';
  // Whether the next update is to scroll the output to its newest line.
  private _scroll = false;

  @query('.output') private _output?: HTMLElement;
  @query('input') private _input?: HTMLInputElement;

  /**
   * Show a command's answer: its lines, after the ones there, or in place of every line where the
   * answer says `clear`. Not `append`, which every element has already, for its child nodes.
   */
  appendOutput(output: CommandOutput): void {
    const lines = Array.isArray(output?.lines) ? output.lines : [];
    this._add(
      lines.map((l) => ({ text: String(l?.text ?? ''), kind: KINDS.has(l?.kind) ? l.kind : 'out' })),
      output?.clear === true,
    );
  }

  /** Empty the output, the welcome lines included. The prompt and its history stay. */
  clear(): void {
    this._lines = [];
  }

  /** Give the prompt the keyboard (once it is drawn, when called before). */
  focusInput(): void {
    if (this._input) this._input.focus();
    else void this.updateComplete.then(() => this._input?.focus());
  }

  private get _max(): number {
    return Number.isFinite(this.maxLines) && this.maxLines >= 1 ? Math.floor(this.maxLines) : DEFAULT_MAX_LINES;
  }

  private _add(lines: WindowLine[], clear: boolean): void {
    const next = clear ? lines : [...this._lines, ...lines];
    this._lines = next.length > this._max ? next.slice(next.length - this._max) : next;
    this._scroll = true;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    // A smaller cap drops the lines it no longer keeps, as an append past it would.
    if (changed.has('maxLines') && this._lines.length > this._max) this._lines = this._lines.slice(this._lines.length - this._max);
  }

  protected override updated(): void {
    if (!this._scroll || !this._output) return;
    this._scroll = false;
    this._output.scrollTop = this._output.scrollHeight;
  }

  // The prompt's keys. Each one the window acts on is kept from the page (prevented and stopped):
  // a shell around it must not take Enter or an arrow for a gesture of its own while a line is
  // being typed. Every other key goes on, the shell's chords among them.
  private _onKeyDown(e: KeyboardEvent): void {
    // While an input method composes, every key is its own: Enter picks the characters, an arrow
    // moves among the candidates, Escape cancels them. None is the line's end or a step of history.
    if (e.isComposing) return;
    const input = e.target as HTMLInputElement;
    const plain = !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
    if (e.key === 'Enter') {
      this._keep(e);
      this._run(input);
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && plain) {
      // Prevented, too: the caret would jump to the start or the end of the line.
      this._keep(e);
      this._recall(input, e.key === 'ArrowUp' ? -1 : 1);
    } else if (e.key === 'Escape' && input.value !== '') {
      // An empty prompt has nothing to empty, and the key goes on: the shell may close the panel.
      this._keep(e);
      input.value = '';
      this._onInput();
    }
  }

  private _keep(e: KeyboardEvent): void {
    e.preventDefault();
    e.stopPropagation();
  }

  private _run(input: HTMLInputElement): void {
    const line = input.value.trim();
    input.value = '';
    if (!line) return;
    // Once for a line run twice in a row, as a shell's history keeps it.
    if (this._history.at(-1) !== line) this._history.push(line);
    if (this._history.length > HISTORY_LIMIT) this._history.splice(0, this._history.length - HISTORY_LIMIT);
    this._onInput();
    this._add([{ text: `>> ${line}`, kind: 'input' }], false);
    this.dispatchEvent(new CustomEvent<CommandRunDetail>('dex-command-run', {
      detail: { line },
      bubbles: true,
      composed: true,
    }));
  }

  // One step through the history, `step` -1 older and 1 newer, over the lines beginning with what
  // was typed before the first step. Past the newest is the prompt as it was typed; past the
  // oldest, nothing moves.
  private _recall(input: HTMLInputElement, step: -1 | 1): void {
    if (this._at === this._history.length) this._draft = input.value;
    let i = this._at + step;
    while (i >= 0 && i < this._history.length && !this._history[i]!.startsWith(this._draft)) i += step;
    if (i < 0) return;
    this._at = Math.min(i, this._history.length);
    input.value = this._at === this._history.length ? this._draft : this._history[this._at]!;
    input.setSelectionRange(input.value.length, input.value.length);
  }

  // A line typed over (or emptied) is the prompt again: the next arrow matches what it says now.
  private _onInput(): void {
    this._at = this._history.length;
  }

  // A click in the output puts the caret at the prompt, as MATLAB's does, unless it ended a
  // selection: copying a value out of the output is what the output is for, and moving the focus
  // would drop it. Chromium keeps a shadow root's selection on the root; elsewhere the document's
  // selection holds it.
  private _onOutputClick(): void {
    const root = this.shadowRoot as (ShadowRoot & { getSelection?: () => Selection | null }) | null;
    const selection = root?.getSelection?.() ?? document.getSelection();
    if (selection && selection.toString() !== '') return;
    this.focusInput();
  }

  override render() {
    return html`
      <div class="output" role="log" aria-label="Command output" tabindex="0" @click=${this._onOutputClick}>
        ${this._lines.map((l) => html`<div class="line ${l.kind}">${l.heading ? `${this.heading} — Command Window` : l.text}</div>`)}
      </div>
      <div class="prompt-row">
        <span class="prompt" aria-hidden="true">&gt;&gt;</span>
        <input
          type="text"
          aria-label="Command"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          @keydown=${this._onKeyDown}
          @input=${this._onInput}
        />
      </div>
    `;
  }
}

/** Registers the widget as `<dex-command-window>`, or under `tag`. */
export function defineCommandWindow(tag = 'dex-command-window'): void {
  defineElement(tag, DexCommandWindow);
}

/**
 * The events `<dex-command-window>` sends, by name. They bubble and are composed, so they reach
 * the document and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend
 * this map, and a listener on an element, the document or the window is typed.
 */
export interface CommandWindowEventMap {
  /**
   * Enter was pressed on a line that is not blank: run it. The window has shown the line after the
   * prompt, kept it in its history and emptied the prompt; the app runs it and hands the answer to
   * `appendOutput()`.
   */
  'dex-command-run': CustomEvent<CommandRunDetail>;
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-command-window': DexCommandWindow;
  }
  interface HTMLElementEventMap extends CommandWindowEventMap {}
  interface DocumentEventMap extends CommandWindowEventMap {}
  interface WindowEventMap extends CommandWindowEventMap {}
}
