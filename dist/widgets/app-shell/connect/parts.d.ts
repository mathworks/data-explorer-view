import type { DexAppShell } from '../dex-app-shell.js';
/** The parts connectShell builds, as it wires them; `remove()` takes every one of them away again. */
export type ShellParts = ReturnType<typeof buildShell>;
/** Fill `shell` with the app's parts, and put the shared overlays in the body. */
export declare function buildShell(shell: DexAppShell, options: {
    appName: string;
}): {
    toolbar: import("../dex-toolbar.js").DexToolbar;
    location: import("../dex-location-bar.js").DexLocationBar;
    explorer: import("../dex-explorer.js").DexExplorer;
    folderPart: import("./dex-shell-folder.js").DexShellFolder;
    tree: import("../../hierarchy/dex-hierarchy.js").DexHierarchy;
    docs: import("./dex-shell-docs.js").DexShellDocs;
    strip: import("../dex-doc-tabs.js").DexDocTabs;
    graphPanel: HTMLElement;
    graph: import("../index.js").DexRelationshipGraph;
    inspectorEmpty: import("./dex-shell-note.js").DexShellNote;
    inspector: import("../../property-inspector/dex-property-inspector.js").DexPropertyInspector;
    status: import("./dex-shell-status.js").DexShellStatus;
    gallery: import("../index.js").DexGalleryPanel;
    search: import("../index.js").DexSearchPanel;
    raw: import("../index.js").DexRawViewer;
    terminal: import("../index.js").DexCommandWindow;
    log: import("../index.js").DexLogPanel;
    palette: import("../index.js").DexCommandPalette;
    editor: import("../../variable-editor/dex-variable-editor.js").DexVariableEditor;
    menu: import("../../context-menu/dex-context-menu.js").DexContextMenu;
    dialog: import("../../error-dialog/dex-error-dialog.js").DexErrorDialog;
    toasts: import("../dex-toast-host.js").DexToastHost;
    settingsPanel: import("../dex-settings-panel.js").DexSettingsPanel;
    aboutPanel: import("../dex-about-panel.js").DexAboutPanel;
    confirm: import("../dex-confirm-dialog.js").DexConfirmDialog;
    /** Whether a modal of the shell's is up: a question, the error dialog, the variable editor (each says `open`). */
    modalOpen(): boolean;
    /** Take the parts out of the shell and the overlays out of the body. */
    remove(): void;
};
