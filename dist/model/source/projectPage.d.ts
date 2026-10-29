import { type ProjectPage, type StoreFs } from 'data-explorer-core';
import type { MspProject } from '../ids/msp.js';
import { type WarningBanner } from '../rows/parseWarnings.js';
/** A project's page, as the page is sent it. */
export interface SetProjectMessage {
    type: 'setProject';
    /** The page: core's model of the parsed project. */
    page: ProjectPage;
    /**
     * The project's folder, as a path to show under its name. Only the app knows it — the store
     * records nothing absolute, by design, so a project stays portable.
     */
    root: string;
    /** What a Managed Simulink Project adds; absent for every project that is not one. */
    msp?: MspProject;
    /** What the parse could not read; absent after a clean read. */
    warnings?: WarningBanner;
}
/**
 * The page for the project whose marker (a `.prj`, or a `matlab.toml`) is at `markerPath`, from
 * its store (core's `readProjectStore`): `root` is the folder the page names, and `mspConfig` the
 * text of `msp_config.json` beside the marker, when there is one.
 *
 * The fallback name is core's `projectFallbackName` of the PATH, not a reduction of the file
 * name: every project in the TOML format spells its definition file identically, so the parent
 * folder is what names it — the same string the hierarchy's project row shows.
 */
export declare function projectPageMessage(store: Record<string, string>, markerPath: string, root: string, mspConfig?: string): SetProjectMessage;
/**
 * The page for the project marker at `markerPath`, read through `fs`: its store, sorted (the order
 * a directory lists in is the filesystem's, not the project's), and `msp_config.json` beside it
 * when there is one. `root` defaults to the marker's folder. An unreachable store is an empty
 * project whose warnings say so, as core's `readProjectStore` has it; it never throws for that.
 */
export declare function readProjectPage(markerPath: string, fs: StoreFs, root?: string): Promise<SetProjectMessage>;
