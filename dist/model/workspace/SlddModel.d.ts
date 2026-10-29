import { type Session } from 'data-explorer-core';
/** Where a read-only binary tab gets what it registers. Both are vscode reads; neither is made
 *  unless the branch below picks it. */
export interface TabSources {
    /** The SHARED parse of a model, for a model only — sourceReads.parsedModelForTab. */
    parsed: () => Promise<unknown>;
    /** The file's bytes from disk, for every other byte-backed format. */
    bytes: () => Promise<ArrayBuffer>;
}
export declare class DocumentRegistry {
    readonly session: Session;
    private readonly cache;
    /**
     * How many open views hold each uri's tree, across BOTH providers that register under the bare
     * uri: the read-only `BinaryEditorProvider` (one per custom document) and the editable
     * `SlddTextEditorProvider` (one per panel). One count rather than one per provider because the
     * two share a srcId — a JSON `.sldd` over the sync limit opens read-only, "Reopen Editor With"
     * moves a file between them, a split panel is a second view — and whichever closes first must
     * not take the tree from under the other.
     *
     * `BinarySlddEditorProvider` is not counted here: it registers under its own prefixed srcId and
     * already releases it from its document's dispose.
     */
    private readonly views;
    /** `session` is the core session every tree is registered in. */
    constructor(session: Session);
    private registered;
    getModel(uriString: string, name: string, text: string): any;
    /** `getModel` for a dictionary's text its caller has already parsed: the same registration. */
    getModelFromContent(uriString: string, name: string, content: Record<string, unknown>): any;
    getModelFromBytes(uriString: string, name: string, bytes: ArrayBuffer): any;
    /**
     * A model whose bytes someone already parsed — the same session entry `getModelFromBytes`
     * makes for one, one `parseModel` earlier.
     *
     * This is the tab's half of the shared parse (sourceCache.ts): the Usage tier may already hold
     * the parse of this very model, because opening its linked dictionary had to summarise it, and
     * re-deriving it here is the duplicate work that made a model open cost two full parses of the
     * same bytes.
     *
     * Everything else about the registration is deliberately identical, `registered()` included:
     * core's `addModelSourceParsed` is `addModelSource` with the parse lifted out, it forwards
     * `parsed.warnings` the same way, and `ModelNode.fromParsed` labels the tree from the srcId
     * rather than from anything in `parsed`. So a model that read short is refused here exactly as
     * it is there — which is the invariant parsedRegistration.test.ts pins between the two.
     */
    getModelFromParsed(uriString: string, name: string, parsed: unknown): any;
    /**
     * The tree a read-only binary tab shows, by the route its FORMAT takes: a model through the
     * shared parse, everything else through its bytes.
     *
     * A named function rather than a ternary inside `BinaryEditorProvider.post`, and the reason is
     * that this branch is the whole of what phase 2 changed on the tab path — a model's rows now come
     * off the same `ParsedSlx` the Usage tier summarises, so opening a model parses it once instead of
     * once per consumer, and opening it after its linked dictionary (which had to parse it to
     * summarise it) parses it not at all. Left in the provider, that decision sat in a module which
     * imports `vscode` and which therefore no unit test can load: reverting it to the old
     * `getModelFromBytes` call left the entire suite green, because the equality sweep in
     * parsedRegistration.test.ts proves the two routes produce identical rows and nothing else could
     * tell which one a tab took. Here it is testable by behaviour — see tabRoute.test.ts, which asserts
     * that a model tab reads no bytes of its own and that every other format reads nothing else.
     *
     * Both sources are THUNKS, which is the other half of the same point: the read a branch does not
     * take must not happen. A model already parsed for a dictionary costs a `stat`, and passing the
     * bytes in would have paid for them before deciding they were not needed.
     */
    getModelForBinaryTab(uriString: string, name: string, sources: TabSources): Promise<any>;
    getProjectModel(uriString: string, name: string, files: Record<string, string>): any;
    invalidate(uriString: string): void;
    /** Drop both halves of what a uri holds: this registry's cached tree and the session's source. */
    release(uriString: string): void;
    /** A view of `uriString` has opened; it holds that uri's tree until `releaseSourceView`. */
    openSourceView(uriString: string): void;
    /**
     * A view of `uriString` has closed. On the LAST one, the cached tree and the session's source
     * are released, and the answer is true.
     *
     * Without this a closed tab's tree lived for the life of the window: 66.8 MB retained per 20 MB
     * dictionary, for every file ever opened. What a release takes away was audited before it was
     * done: every reader of a registration (`findNode`'s selection, matrix and child requests) is a
     * row of an OPEN tab; the Usage column and the tree read from disk, not from the session; and
     * navigating to a file opens it, which registers it again. The one reader that loses something is
     * core's own `UsedBy` cell, which counted every registered model — see usageCells.ts.
     *
     * A release with no view to release (never opened, or one past the last) does nothing and
     * answers false: an unmatched release is a caller's bug, and the tree it would drop is not its own.
     */
    releaseSourceView(uriString: string): boolean;
    /**
     * Release `uriString`'s tree if no view holds it; true when it did.
     *
     * For a read that lands after its last view closed. A read-only tab's read is asynchronous — a
     * large file is still parsing when the user closes it — and the registration it ends in happened
     * after the release, so nothing would ever release it. A view that opened meanwhile owns the tree,
     * and keeps it.
     */
    releaseIfUnviewed(uriString: string): boolean;
    /**
     * The tree the session currently holds for a URI, or null — no parse, no registration.
     *
     * What an entry-scoped repaint starts from: the model that is already built, rather than
     * the one getModel would rebuild from text (~300 ms on a 46 MB dictionary, which is the
     * cost that path exists to avoid).
     *
     * The SESSION's copy, deliberately, not this registry's `cache`: the two are set together by
     * every adder above, but `invalidate` clears only the cache — and it is called on every
     * keystroke in an open .sldd (see extension.ts, which drops the cache so the tree view and
     * the usage graph re-read an edited file). The registered source is also the one
     * `findNodeById` resolves into, so it is the only answer an entry op can be applied to.
     *
     * Says nothing about whether that tree still matches the text; only its caller knows what
     * has been applied to it since (see SlddTextEditorProvider's modelInSync).
     */
    peekModel(uriString: string): any | null;
    findNode(uriString: string, nodeId: string): any | null;
}
/**
 * A tree of a dictionary's text that nothing else can see: built in a session of its own, so it
 * is not registered under any uri, not cached here, and not found by the Property Inspector or
 * an edit. For a reading that is only ever compared against — the baseline of a document opened
 * with unsaved changes is the FILE's text, while the document holds other text under the uri.
 */
export declare function parseDetached(name: string, text: string): any;
export declare function getModel(uriString: string, name: string, text: string): any;
/** See `DocumentRegistry.getModelFromBytes`. */
export declare function getModelFromBytes(uriString: string, name: string, bytes: ArrayBuffer): any;
/** See `DocumentRegistry.getModelFromParsed`. */
export declare function getModelFromParsed(uriString: string, name: string, parsed: unknown): any;
/** See `DocumentRegistry.getModelForBinaryTab`. */
export declare function getModelForBinaryTab(uriString: string, name: string, sources: TabSources): Promise<any>;
/** See `DocumentRegistry.getProjectModel`. */
export declare function getProjectModel(uriString: string, name: string, files: Record<string, string>): any;
export declare function invalidate(uriString: string): void;
/** See `DocumentRegistry.openSourceView`. */
export declare function openSourceView(uriString: string): void;
/** See `DocumentRegistry.releaseSourceView`. */
export declare function releaseSourceView(uriString: string): boolean;
/** See `DocumentRegistry.releaseIfUnviewed`. */
export declare function releaseIfUnviewed(uriString: string): boolean;
/** See `DocumentRegistry.peekModel`. */
export declare function peekModel(uriString: string): any | null;
/** See `DocumentRegistry.findNode`. */
export declare function findNode(uriString: string, nodeId: string): any | null;
