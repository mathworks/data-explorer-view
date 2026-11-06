/** A theme a page can be drawn in: the three theme.css defines. */
export type Theme = 'light' | 'dark' | 'high-contrast';
/** What a person sets in the Settings popover. */
export interface ShellSettings {
    /** The theme, or `'auto'` to follow the system's (see `effectiveTheme`). */
    theme: Theme | 'auto';
    /** The toolbar's density: labelled buttons, or icons alone. */
    toolbar: 'normal' | 'compact';
}
/** The settings before anyone changes them: the system's theme, and the labelled toolbar. */
export declare const DEFAULT_SETTINGS: ShellSettings;
/** The part of the Web Storage API the settings use: `localStorage` is one. */
export interface KeyValueStore {
    /** The value kept under `key`, or `null` for none. */
    getItem(key: string): string | null;
    /** Keep `value` under `key`. */
    setItem(key: string, value: string): void;
}
/**
 * The settings kept under `key` in `store`. Junk becomes the defaults, field by field: no store,
 * nothing kept, text that is not a JSON object, or a store that throws gives every default; a field
 * that is missing or holds a value this version does not know gives that field's. A new object
 * each time, so a caller may change what it is handed.
 */
export declare function readSettings(store: KeyValueStore | null, key: string): ShellSettings;
/**
 * Keep `settings` under `key` in `store`, as the JSON `readSettings` reads. Only the two fields go
 * in, whatever else the object carries. No store, or one that throws (a full quota, a refused
 * store), keeps nothing and says nothing: the settings still apply to this session, they just do
 * not outlive it.
 */
export declare function writeSettings(store: KeyValueStore | null, key: string, settings: ShellSettings): void;
/**
 * The theme a page is drawn in: the setting's own, or for `'auto'` the system's, which the caller
 * reads from `prefers-color-scheme` and `prefers-contrast` / `forced-colors`.
 */
export declare function effectiveTheme(setting: ShellSettings['theme'], system: Theme): Theme;
