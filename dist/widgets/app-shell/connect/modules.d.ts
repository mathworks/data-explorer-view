import type { DexAppShell } from '../dex-app-shell.js';
import { type OpenTab } from './documents.js';
import type { FolderView } from './folder.js';
import type { ShellParts } from './parts.js';
import type { ShellHost } from './types.js';
/** What the modules read of the shell, and do through it. */
export interface ModulesContext {
    shell: DexAppShell;
    parts: ShellParts;
    host: ShellHost;
    /** The active tab, or none at Root. */
    active(): OpenTab | undefined;
    /** Every open tab, in the row's order. */
    tabs(): readonly OpenTab[];
    /** The folder shown, if any. */
    folder(): FolderView | undefined;
    /** Open the file of `uri` as a preview, on the row `name` names, if it names one. */
    openOn(uri: string, name?: string): void;
    /** Save `tab` for the Terminal's `save`: what to say, or a rejection saying why not. */
    save(tab: OpenTab): Promise<string>;
    /** Something could not be done: say so (a toast, and the Log). */
    failed(message: string): void;
    /** Ask for a refresh, a microtask from now. */
    later(): void;
}
/** The modules, as connectShell drives them. */
export interface Modules {
    /** Show each module as the active tab, its selection and the folder are now. */
    refresh(): void;
    /** Bring the view `view` forward; Search's and the Terminal's box takes the keyboard. */
    show(view: string): void;
    /** The user brought `view` forward (its button, its chord): its box takes the keyboard. */
    shown(view: string): void;
    /** Settles once the Terminal's lines run so far have. */
    idle(): Promise<void>;
    /** Say what Search covers: the open files, and the folder `folderName` if one is shown. */
    scope(folderName: string | null): void;
    /** The folder's names were read again: Search asks its query again. */
    namesChanged(): void;
    dispose(): void;
}
/** Wire the modules' views of `context.parts`. */
export declare function connectModules(context: ModulesContext): Modules;
