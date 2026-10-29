import { type PlanOptions, type RowPlanner } from '../rows/rowPlanner.js';
import type { WarningBanner } from '../rows/parseWarnings.js';
import type { DocumentRegistry } from '../workspace/SlddModel.js';
/** What kind of file a document is, which decides what it opens in. */
export type DocKind = 'dictionary' | 'model' | 'mat' | 'project';
/** The kind of the file `name` names, or undefined for a file this package does not open. */
export declare function docKindOf(name: string): DocKind | undefined;
/** One read of a document: the tree it registered, and how its table is planned from it. */
export interface Reading {
    /** The id the tree is registered under: the uri, or `binedit:` + the uri. */
    srcId: string;
    node: any;
    planner: RowPlanner;
    /** The stamps a paint is planned with. */
    paint?: PlanOptions;
    /** The stamps a fetch of children is planned with. */
    fetch?: PlanOptions;
    /** The notice above the table, asked as the paint is built. */
    notice(): string | undefined;
    /** The banner as the table shows it. */
    banner(banner: WarningBanner | undefined): WarningBanner | undefined;
    /** The banner text of a failure while the paint is built. */
    paintFailed(err: unknown): string;
}
/**
 * Read `bytes`, the file `name` opened under `uri`, into `registry`. Throws an Error whose message
 * is what the table's banner shows when the file cannot be read.
 */
export declare function readDocument(registry: DocumentRegistry, kind: Exclude<DocKind, 'project'>, name: string, uri: string, bytes: ArrayBuffer): Reading;
