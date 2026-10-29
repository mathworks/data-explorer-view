const EMPTY = { start: 0, count: 0, before: 0, after: 0, span: 0 };
// A finite number at least `min`, for inputs that come from a layout engine. A
// scroll offset reads negative during overscroll on macOS and NaN from a detached
// element, and either one would otherwise propagate into a negative start index.
const atLeast = (n, min) => (Number.isFinite(n) && n > min ? n : min);
export function virtualWindow({ items, itemSize, scroll, viewport, buffer }) {
    const total = Math.max(0, Math.floor(atLeast(items, 0)));
    if (total === 0) {
        return EMPTY;
    }
    const size = atLeast(itemSize, 0);
    if (size === 0) {
        // An item of no size has no window: every index is at offset zero, so there is no
        // scroll position to be near. Neither caller passes this — both substitute an
        // assumed size while nothing has been laid out yet, precisely so that the first
        // frame of a million-cell grid is still a window. It is defined here because the
        // function has to answer for its whole domain, and of the two answers available
        // this is the harmless one: a whole short run is a slow render, a whole long run
        // is a slow render, and rendering nothing is a panel that stays blank until
        // something unrelated triggers the next update.
        return { start: 0, count: total, before: 0, after: 0, span: 0 };
    }
    const pad = Math.max(0, Math.floor(atLeast(buffer, 0)));
    // Clamped to the last item: the cells can arrive at a grid that is already
    // scrolled, and a shorter matrix can replace a longer one in the same instance.
    // Either way a start index past the end must still render the tail rather than
    // an empty window the user cannot scroll out of.
    const start = Math.min(total - 1, Math.max(0, Math.floor(atLeast(scroll, 0) / size) - pad));
    // `ceil` and not `floor`: a viewport 1.5 items tall shows parts of two, and the
    // partly-visible one at the bottom edge is the one a reader notices missing.
    const onScreen = Math.ceil(atLeast(viewport, 0) / size);
    const count = Math.min(total - start, onScreen + pad * 2 + 1);
    return {
        start,
        count,
        before: start * size,
        after: (total - start - count) * size,
        span: total * size,
    };
}
