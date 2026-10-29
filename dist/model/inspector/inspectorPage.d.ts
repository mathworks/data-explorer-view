export declare class InspectorPage {
    private readonly post;
    /** The current view's page has said `ready`, so a message posted now reaches it. */
    private ready;
    /** The rows the inspector shows, or null for the empty pane. */
    private groups;
    /** `groups` serialized, as they were posted: what the next node's rows are compared with. */
    private groupsSent;
    /** The cells the page's Variable Editor was sent for the rows on display, serialized. */
    private cellsSent;
    /**
     * The node on display, kept for `requestMatrix` (its Value row may carry a MatrixDescriptor,
     * and the cells behind one are fetched when the panel opens: matrixRequest.ts) and for the
     * referrer of a link.
     *
     * Resolved from the node in hand rather than through SlddModel.findNode, which the three table
     * providers use: the inspector is handed a node and never learns which document it came from.
     * Matching on `id` is what makes that safe: a request for anything other than what is on
     * screen is refused, so this cannot answer about a node the user is not looking at.
     */
    node: any;
    /**
     * The document `node` came from, handed to onNavigate as a click's referrer: a bare file name
     * in a link resolves to the copy in that document's own project or folder.
     */
    from: string | undefined;
    /** `post` sends a message to the current view's page. */
    constructor(post: (message: unknown) => void);
    /** A view was resolved: its page is loading, and takes nothing until it says `ready`. */
    opened(): void;
    /**
     * The page said `ready`. It has just loaded, so it shows the empty pane (pi-main.ts says
     * `ready` after setEmpty) and no Variable Editor: there is something to send only when the
     * inspector holds a node.
     */
    loaded(): void;
    /** The view went, and with it what it showed and the node behind it. */
    closed(): void;
    /** Show `node`, from the document `from`, unless the page already shows exactly that. */
    show(node: any, from?: string): void;
    clear(): void;
    /**
     * Answer a `requestMatrix` for the node on display. Always posts exactly one `matrixCells`,
     * with the id echoed, on the same terms as the table providers' shared `answerMatrixRequest`:
     * a panel that is open and waiting is worse off with silence than with a reason.
     */
    answerMatrix(nodeId: string): void;
    /** Whether `node`'s cells are not the ones the page's open Variable Editor was sent. */
    private cellsChanged;
    private forget;
}
