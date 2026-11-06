import { type KeyValueStore } from '../../../model/shell/settings.js';
import type { Rect } from '../../../model/shell/placement.js';
import type { DexTreeTable } from '../../tree-table/dex-tree-table.js';
import type { DexAppShell } from '../dex-app-shell.js';
import type { DexAboutPanel } from '../dex-about-panel.js';
import type { DexLocationBar } from '../dex-location-bar.js';
import type { DexSettingsPanel } from '../dex-settings-panel.js';
import type { DexToolbar } from '../dex-toolbar.js';
import { type SystemTheme } from './theme.js';
/** The popovers, as connectShell drives them. */
export interface Popovers {
    /** Open the popover of `id` beside its button (or `anchor`), or close it when it is open: a press of the gear or the (i). */
    toggle(id: 'settings' | 'about', anchor?: Rect): void;
    /**
     * Close both: before a dialog opens over them, until the shared modal stack exists, since one
     * Escape would otherwise close a popover and the dialog over it.
     */
    closeAll(): void;
    /** The style a table the shell makes now is drawn in: the table style setting, in the table's own words. */
    tableStyle(): DexTreeTable['tableStyle'];
    /** Stop listening: to the settings popover, and to the system's theme. */
    dispose(): void;
}
/** The page's localStorage, or none where the page refuses it (an opaque origin, storage turned off). */
export declare function pageStorage(): KeyValueStore | null;
/**
 * Wire the Settings and About popovers. The settings live in `store` under `key`; the theme goes on
 * the page, the density on `toolbar`, the icon style on `toolbar`, `location` and `shell`, and the
 * table style on every table `tables` names (the open ones: a table made later asks `tableStyle()`).
 */
export declare function connectPopovers(shell: DexAppShell, parts: {
    settingsPanel: DexSettingsPanel;
    aboutPanel: DexAboutPanel;
    toolbar: DexToolbar;
    location: DexLocationBar;
}, options: {
    store: KeyValueStore | null;
    key: string;
    system: SystemTheme;
    appName: string;
    about: {
        label: string;
        value: string;
    }[];
    tables(): Iterable<DexTreeTable>;
}): Popovers;
