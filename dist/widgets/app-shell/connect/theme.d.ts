import type { Theme } from '../../../model/shell/settings.js';
/** Draw the page in `theme`: view's theme stylesheet reads it from the root element's `data-theme`. */
export declare function applyTheme(theme: Theme): void;
/** The system's theme, and its changes, as connectShell's `systemTheme` option takes them. */
export interface SystemTheme {
    now(): Theme;
    on(listener: (theme: Theme) => void): () => void;
}
/**
 * The system's theme from the page's media queries: high contrast under forced colours or a
 * request for more contrast, else dark under a dark colour scheme, else light. `on` hears every
 * change of any of them, with the theme as it then is. A page with no matchMedia is light.
 */
export declare function systemThemeFromMedia(): SystemTheme;
/** A system theme a host can also tell: `set` is ShellHandle.setSystemTheme. */
export interface SettableSystemTheme extends SystemTheme {
    /** The system's theme is `theme` from now on, whatever the source says. A value that is no theme is passed over. */
    set(theme: Theme): void;
}
/**
 * The system's theme as `source` has it, until a host tells one (`set`): from then on the theme
 * told, and the source is no longer heeded, so a host that hears the theme (an Electron page,
 * told over IPC) and the page's media queries never take turns. A listener hears each change of
 * the theme, from either, and nothing when the theme it already is is told again.
 */
export declare function settableSystemTheme(source: SystemTheme): SettableSystemTheme;
