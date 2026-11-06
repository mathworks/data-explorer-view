// Copyright 2026 The MathWorks, Inc.
//
// The app shell's settings: the theme, how dense the toolbar is, whether the shell's own buttons
// draw their icons in one colour, and how the tables are ruled. The Settings popover changes them;
// the shell keeps them in a key-value store (an app passes its localStorage) and reads them back
// when it starts.
//
// The prototype kept each setting under a key of its own (dex-theme, dex-toolbar-layout) and
// took whatever string was there. Here they are one JSON record under a key the app chooses, so two
// apps on one origin do not share their settings, and each field is checked as it is read: a store
// an older version or a hand edit wrote can hold a value this version does not know, and one bad
// field must not cost the others.
//
// The store is the app's, and a browser can refuse it: a sandboxed frame or a privacy mode throws
// on every access, and a full quota on a write. Settings are a convenience, so a refused store
// reads as the defaults and a refused write is dropped; the shell comes up either way.
//
// DOM-free: KeyValueStore is the slice of the Web Storage API used, so localStorage is one without
// the model naming a DOM type, and a test's Map-backed store is another.
/**
 * The settings before anyone changes them: the system's theme, the labelled toolbar, the icons in
 * one colour (the prototype's default), and the tables in a grid (the table's own).
 */
export const DEFAULT_SETTINGS = Object.freeze({ theme: 'auto', toolbar: 'normal', iconStyle: 'minimal', tableStyle: 'grid' });
const THEMES = ['auto', 'light', 'dark', 'high-contrast'];
const TOOLBARS = ['normal', 'compact'];
const ICON_STYLES = ['minimal', 'colorful'];
const TABLE_STYLES = ['grid', 'rows'];
/** The field `name` of `record` when it is one of `known`, else its default. */
function field(record, name, known) {
    const value = record[name];
    return typeof value === 'string' && known.includes(value) ? value : DEFAULT_SETTINGS[name];
}
/**
 * The settings kept under `key` in `store`. Junk becomes the defaults, field by field: no store,
 * nothing kept, text that is not a JSON object, or a store that throws gives every default; a field
 * that is missing or holds a value this version does not know gives that field's. A new object
 * each time, so a caller may change what it is handed.
 */
export function readSettings(store, key) {
    let kept;
    try {
        const text = store?.getItem(key);
        kept = text == null ? undefined : JSON.parse(text);
    }
    catch {
        // A refused store, or text that is not JSON: nothing usable was kept.
        kept = undefined;
    }
    const record = typeof kept === 'object' && kept !== null && !Array.isArray(kept) ? kept : {};
    // A record an earlier version kept has no icon or table style: those come to their defaults.
    return {
        theme: field(record, 'theme', THEMES),
        toolbar: field(record, 'toolbar', TOOLBARS),
        iconStyle: field(record, 'iconStyle', ICON_STYLES),
        tableStyle: field(record, 'tableStyle', TABLE_STYLES),
    };
}
/**
 * Keep `settings` under `key` in `store`, as the JSON `readSettings` reads. Only the settings' own
 * fields go in, whatever else the object carries. No store, or one that throws (a full quota, a
 * refused store), keeps nothing and says nothing: the settings still apply to this session, they
 * just do not outlive it.
 */
export function writeSettings(store, key, settings) {
    try {
        const { theme, toolbar, iconStyle, tableStyle } = settings;
        store?.setItem(key, JSON.stringify({ theme, toolbar, iconStyle, tableStyle }));
    }
    catch {
        // A refused write: see above.
    }
}
/**
 * The theme a page is drawn in: the setting's own, or for `'auto'` the system's, which the caller
 * reads from `prefers-color-scheme` and `prefers-contrast` / `forced-colors`.
 */
export function effectiveTheme(setting, system) {
    return setting === 'auto' ? system : setting;
}
