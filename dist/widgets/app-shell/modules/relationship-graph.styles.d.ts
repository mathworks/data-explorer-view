/**
 * The look of `<dex-relationship-graph>`: a grey canvas, a box per file in its kind's colour (a
 * model blue, a dictionary green, a MAT-file sand) with a soft shadow, a file not open dashed, the
 * items of an open box in pale rows, a model's workspace variables under a dashed divider, edges in
 * their kind's colour with a dot where they leave and an arrowhead where they arrive, and the zoom
 * buttons and the Legend floating over the corners.
 *
 * Every colour is a `--dex-graph-*` token (or a shared one) so each theme sets its own; SVG takes a
 * stroke and a fill from CSS as any element takes a colour, so the edges and markers are themed by
 * class rather than by attribute.
 */
export declare const relationshipGraphStyles: import("lit").CSSResult;
