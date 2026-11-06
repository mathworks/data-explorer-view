// Copyright 2026 The MathWorks, Inc.
//
// The app shell's settings: the theme, and how dense the toolbar is. The Settings popover changes
// them; the shell keeps them in a key-value store (an app passes its localStorage) and reads them
// back when it starts.
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
/** The settings before anyone changes them: the system's theme, and the labelled toolbar. */
export const DEFAULT_SETTINGS = Object.freeze({ theme: 'auto', toolbar: 'normal' });
const THEMES = ['auto', 'light', 'dark', 'high-contrast'];
const TOOLBARS = ['normal', 'compact'];
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
    return {
        theme: typeof record.theme === 'string' && THEMES.includes(record.theme) ? record.theme : DEFAULT_SETTINGS.theme,
        toolbar: typeof record.toolbar === 'string' && TOOLBARS.includes(record.toolbar) ? record.toolbar : DEFAULT_SETTINGS.toolbar,
    };
}
/**
 * Keep `settings` under `key` in `store`, as the JSON `readSettings` reads. Only the two fields go
 * in, whatever else the object carries. No store, or one that throws (a full quota, a refused
 * store), keeps nothing and says nothing: the settings still apply to this session, they just do
 * not outlive it.
 */
export function writeSettings(store, key, settings) {
    try {
        store?.setItem(key, JSON.stringify({ theme: settings.theme, toolbar: settings.toolbar }));
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
