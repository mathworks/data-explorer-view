import { LitElement } from 'lit';
/**
 * One message for the corner. A workspace Notice (`level` 'status', 'warning' or 'error') is a
 * Toast as it stands, so the shell hands the workspace's notices here unchanged; 'info' is the
 * shell's own (a file opened, a file saved).
 */
export interface Toast {
    /** 'status' and 'info' go by themselves; 'warning' and 'error' stay until closed. */
    level: 'info' | 'status' | 'warning' | 'error';
    /** What the toast says, shown as text (a line break in it starts a new line). */
    message: string;
    /** For 'status' and 'info': how long it shows, in milliseconds (4000 when not given). */
    ms?: number;
}
/**
 * The shell's toasts, in the bottom-right corner of the window: show() adds one at the bottom
 * of the stack. A 'status' or 'info' toast goes by itself after its `ms`; a 'warning' or an
 * 'error' stays until its × is pressed, since what it says has to be read. A toast the pointer
 * is on, or whose × has focus, waits for the user, and is timed afresh once they leave it. At
 * most three are shown, and a fourth takes the oldest away. A screen reader hears each one as it
 * is shown, politely for 'status' and 'info' and at once for 'warning' and 'error'. It sends no
 * events: what it shows is the app's business, and closing one changes nothing but the screen.
 *
 * @tagname dex-toast-host
 */
export declare class DexToastHost extends LitElement {
    static styles: import("lit").CSSResult[];
    private _shown;
    private _nextKey;
    private _timers;
    private _pointerOn;
    private _focusIn;
    /**
     * Shows a toast at the bottom of the stack. 'status' and 'info' go by themselves after `ms`
     * (default 4000); 'warning' and 'error' stay until closed, whatever `ms` says. At most three
     * are shown: a fourth takes the oldest away.
     */
    show(toast: Toast): void;
    /** Takes every toast away, stops every timer, and empties what a screen reader would read. */
    clear(): void;
    connectedCallback(): void;
    disconnectedCallback(): void;
    private _startTimer;
    private _stopTimer;
    private _forget;
    private _dismiss;
    private _hold;
    private _release;
    private _announce;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-toast-host>`, or under `tag`. */
export declare function defineToastHost(tag?: string): void;
declare global {
    interface HTMLElementTagNameMap {
        'dex-toast-host': DexToastHost;
    }
}
