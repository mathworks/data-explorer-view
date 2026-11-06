import { LitElement, type PropertyValues } from 'lit';
import type { CommandOutput } from '../../../model/shell/commands.js';
/** What `dex-command-run` carries: the line typed at the prompt, without the spaces around it. */
export interface CommandRunDetail {
    line: string;
}
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
export declare class DexCommandWindow extends LitElement {
    static styles: import("lit").CSSResult[];
    /**
     * The most lines the output keeps; past it the oldest go, so a long session does not grow the
     * page without bound. Default 5000. Attribute `max-lines`.
     */
    maxLines: number;
    /**
     * The app the welcome's first line names, "<heading> — Command Window". Default 'Data Explorer'.
     * Attribute `heading`.
     */
    heading: string;
    private _lines;
    private _history;
    private _at;
    private _draft;
    private _scroll;
    private _output?;
    private _input?;
    /**
     * Show a command's answer: its lines, after the ones there, or in place of every line where the
     * answer says `clear`. Not `append`, which every element has already, for its child nodes.
     */
    appendOutput(output: CommandOutput): void;
    /** Empty the output, the welcome lines included. The prompt and its history stay. */
    clear(): void;
    /** Give the prompt the keyboard (once it is drawn, when called before). */
    focusInput(): void;
    private get _max();
    private _add;
    protected willUpdate(changed: PropertyValues<this>): void;
    protected updated(): void;
    private _onKeyDown;
    private _keep;
    private _run;
    private _recall;
    private _onInput;
    private _onOutputClick;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-command-window>`, or under `tag`. */
export declare function defineCommandWindow(tag?: string): void;
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
    interface HTMLElementEventMap extends CommandWindowEventMap {
    }
    interface DocumentEventMap extends CommandWindowEventMap {
    }
    interface WindowEventMap extends CommandWindowEventMap {
    }
}
