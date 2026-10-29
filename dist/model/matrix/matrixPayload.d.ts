/**
 * What a ROW carries: everything the glyph and the panel's title line need, and no
 * cells. Every griddable row in the table holds one of these, so it has to be
 * cheap — a 1000x1000 entry's cells are 4 MB, which is 4 MB per row stamped for a
 * panel the user may never open. `nodeId` is how the table asks its source for the
 * cells when one is opened (`TableSource.matrix`).
 */
export interface MatrixDescriptor {
    /** Panel title name — 'Kp', or 'ParamMat.Value' when the matrix is a property. */
    name: string;
    /** MATLAB class for the title ('double', 'cell', 'logical'). NOT arrayType. */
    className: string;
    /** effectiveDims: trailing singletons past the 2nd dropped.
     *  dims[0]xdims[1] is the grid; dims[2..] page. */
    dims: number[];
    /** The ROW's own node, not the matrix owner's: a property row's matrix lives on
     *  its `Value` child, and `matrixForRow` is the single rule that resolves that.
     *  The fetch re-runs that same rule rather than a second one agreeing with it. */
    nodeId: string;
}
/** A descriptor plus the cells — what a fetch answers with, never what a row holds. */
export interface MatrixPayload extends MatrixDescriptor {
    /** Element display strings in CANONICAL order — row-major within a page, pages
     *  in trailing-dim column-major order. Placed by each element's own subscript
     *  label, NOT by its position in the element list, which is row-major for
     *  numerics and column-major for cell/string/struct/object. See Data fact 3. */
    cells: string[];
}
/**
 * 1000x1000 — the shape a customer dictionary actually held, and the one that
 * prompted all of this.
 *
 * This is the RENDERER's budget and nothing else. Measured against the shipped
 * dex-matrix-grid in real Chromium, in the 640x420 scrolling popup the panel uses:
 * 4,096 cells build in 25 ms for 7 MB of renderer heap, 99,856 in 581 ms for 63 MB,
 * 1,000,000 in ~6 s for ~594 MB. Scroll latency is FLAT at 21-28 ms across that
 * whole range, which is the measurement that matters: the panel is read-only, so
 * once it is built nothing about it degrades with size, and the only cost of a high
 * cap is the one-off build on an explicit open.
 *
 * It used to have to stay below core's MAX_EXPANDED_ELEMENTS (10,000), because the
 * cells were read off element child nodes and core stops creating those past that
 * count. It no longer does: the cells come from `displayElements()`, which answers
 * over the element data whether or not the array was ever expanded. That is the
 * whole point of the accessor — the TABLE's limit and the PANEL's limit are
 * decisions about different things, and they are now independent.
 */
export declare const MAX_MATRIX_ELEMENTS = 1000000;
export declare const GRIDDABLE_CLASSES: Set<string>;
export declare function effectiveDims(dims: unknown): number[];
/**
 * The 1-based MATLAB subscripts in an element's displayName, or null if the label
 * is not `<parentName>(i,j,...)` / `<parentName>{i,j,...}`. Core builds every
 * element label exactly that way (BaseNode.displayName -> subscriptLabel), so a
 * label that does not parse means core changed and we must not guess.
 */
export declare function subsOf(parentName: string, label: unknown): number[] | null;
/**
 * The canonical slot for 1-based subscripts in a dims-shaped buffer: row-major
 * within a page, pages in trailing-dim column-major order (dimension 3 varying
 * fastest, which is MATLAB's own page order). -1 when the rank disagrees or any
 * subscript is out of range.
 */
export declare function canonicalIndex(subs: number[], dims: number[]): number;
/**
 * The gate. `spread >= 2` is core's own test for when it emits full subscripts
 * (Subscript.ts:74-79), so the gate and the label form the placement rule needs
 * are one condition — and it excludes every vector, including a 1x1x4, which a
 * `dims.length >= 3` clause would have let through as a 1x1 grid with four pages.
 */
export declare function isGriddable(node: any): boolean;
/**
 * The node that OWNS the row's matrix: the node itself when it is one, else its
 * `Value` child — but only when the row is already displaying that child's value.
 * An object property row (`ParamMat`) shows the literal while the matrix lives one
 * level down, so without this the affordance would sit on a row the user has to
 * expand and hunt for. The displayValue check is what keeps it off a struct row
 * that merely happens to have a field named `Value`: that row shows
 * `<1x1 struct>`, not the field's literal.
 */
export declare function matrixForRow(node: any): any | null;
/**
 * What a row carries: the title and shape, no cells. null when this row has no
 * grid-worthy matrix. Total: never throws.
 *
 * This is NOT a promise that the cells will build — a label anomaly is only
 * discoverable by building them, which is the cost this function exists to avoid.
 * The fetch is therefore allowed to come back empty-handed, and the panel says so
 * rather than showing a blank grid.
 */
export declare function matrixDescriptor(node: any): MatrixDescriptor | null;
/**
 * The descriptor AND the cells — what a fetch answers with. null when this row has
 * no grid-worthy matrix, or when the cells fail to lay out. Total: never throws.
 */
export declare function matrixPayload(node: any): MatrixPayload | null;
/**
 * Stamp `_matrix` onto a row when its node owns a grid-worthy matrix. A sibling
 * `_`-prefixed key, NOT `row.Value.matrix`: core emits Value as a bare string and
 * puts editability on the sibling `_valueEditable`, and the table's Value branch
 * switches on that shape, so promoting Value to an object would silently change
 * which field supplies `editable`. Matches `_canCopy` / `_canDelete` /
 * `_valueEditable`, the established convention for host-computed row extras.
 *
 * The DESCRIPTOR, not the payload: a row is built for every node in the table, and
 * stamping cells meant building and shipping every griddable matrix in the file
 * whether or not a panel was ever opened.
 */
export declare function stampMatrix<T extends object>(row: T, node: any): T;
