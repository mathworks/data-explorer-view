import { LitElement, type PropertyValues } from 'lit';
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
export declare class DexLogPanel extends LitElement {
    static styles: import("lit").CSSResult[];
    /**
     * Which lines are shown, by the least level: `all` (the default), `warning` (warnings and
     * errors) or `error`. A choice in the toolbar sets it and sends `dex-log-filter-changed`; set
     * by the app it sends nothing. A value not one of these is `all`. Attribute `filter`.
     */
    filter: LogFilter;
    private _lines;
    private _nextKey;
    private _follow;
    private _toNewest;
    private _resize;
    private _busyFrame;
    /**
     * Adds a line at the bottom, dropping the oldest once there are a thousand. Its time is the
     * entry's `at`, or now; its level is the entry's, or 'info' for one not known. Not `append`:
     * that is the DOM's own, which puts nodes in the element.
     */
    appendEntry(entry: LogEntry): void;
    /** Takes every line away, sending nothing. */
    clear(): void;
    connectedCallback(): void;
    disconnectedCallback(): void;
    protected firstUpdated(): void;
    protected willUpdate(changed: PropertyValues<this>): void;
    protected updated(): void;
    private _observe;
    private _linesBox;
    private _toBottom;
    private _atBottom;
    private _onScroll;
    private _beginBusy;
    private _endBusy;
    private _shownFilter;
    private _choose;
    private _onClear;
    private _onFilterKey;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-log-panel>`, or under `tag`. */
export declare function defineLogPanel(tag?: string): void;
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
    interface HTMLElementEventMap extends LogPanelEventMap {
    }
    interface DocumentEventMap extends LogPanelEventMap {
    }
    interface WindowEventMap extends LogPanelEventMap {
    }
}
