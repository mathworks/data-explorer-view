// Copyright 2026 The MathWorks, Inc.
//
// The shell's Settings and About: the settings read back when the shell starts and the theme they
// name applied at once (the prototype applied a kept theme only once Settings was opened, so a
// dark choice came back light until then), Auto following the system's theme as it changes, a
// change kept and applied, and the two popovers toggled by their buttons and their commands.
// connectShell's, in a module of its own so that connectShell is the documents' wiring.
import { effectiveTheme, readSettings, writeSettings } from '../../../model/shell/settings.js';
import { applyTheme } from './theme.js';
/** The page's localStorage, or none where the page refuses it (an opaque origin, storage turned off). */
export function pageStorage() {
    try {
        return localStorage;
    }
    catch {
        return null;
    }
}
/**
 * Wire the Settings and About popovers. The settings live in `store` under `key`; the theme goes on
 * the page and the density on `toolbar`.
 */
export function connectPopovers(shell, parts, options) {
    const { settingsPanel, aboutPanel, toolbar } = parts;
    const { store, key, system } = options;
    let settings = readSettings(store, key);
    const apply = () => {
        applyTheme(effectiveTheme(settings.theme, system.now()));
        settingsPanel.settings = settings;
        toolbar.compact = settings.toolbar === 'compact';
    };
    // At once, not when Settings first opens: a theme chosen in an earlier session is the page's now.
    apply();
    const stopSystem = system.on((theme) => {
        if (settings.theme === 'auto')
            applyTheme(theme);
    });
    // The popover asks; the shell applies, keeps, and shows the settings back in it.
    const onChange = (e) => {
        settings = e.detail.settings;
        writeSettings(store, key, settings);
        apply();
    };
    settingsPanel.addEventListener('dex-settings-change', onChange);
    aboutPanel.heading = options.appName;
    aboutPanel.lines = options.about;
    return {
        toggle(id, anchor) {
            const panel = id === 'settings' ? settingsPanel : aboutPanel;
            if (panel.open)
                return panel.close();
            panel.show(shell.anchorOf(id) ?? anchor ?? { x: 0, y: 0, width: 0, height: 0 });
        },
        closeAll() {
            settingsPanel.close();
            aboutPanel.close();
        },
        dispose() {
            settingsPanel.removeEventListener('dex-settings-change', onChange);
            stopSystem();
        },
    };
}
