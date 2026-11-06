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
