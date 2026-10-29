import { LitElement } from 'lit';
import '../shared/dex-icon.js';
export declare class DexAddGallery extends LitElement {
    static styles: import("lit").CSSResult;
    /**
     * Whether an add keeps the popover open.
     *
     * Owned by the table, not here, so the choice survives closing and reopening within a
     * session: a user who pins is telling you about their next several minutes, not about
     * this one popover.
     */
    pinned: boolean;
    /**
     * The classes a MAT-file can take a new variable of, as its host says core lists them, or null
     * for a dictionary's gallery. Given, the tiles are those classes' (matCatalog): a MAT-file has
     * no sections, so no tile names one, and nothing is offered that the file cannot take.
     */
    classes: readonly string[] | null;
    /**
     * Which tile is the grid's one tab stop — the roving tabindex.
     *
     * 28 tiles were 28 tab stops, so reaching Configurations from the keyboard cost 20-odd
     * presses of Tab and leaving the gallery cost the rest. The pattern every grid of buttons
     * uses instead is this: the grid is ONE stop, and the arrows move within it. Tab then means
     * "leave", which is what a user pressing it wants.
     *
     * An index into the tiles in DOM order, which is the catalog's order. Not a tile identity,
     * because the movement is positional: Left/Right is a step along this list and runs from the
     * end of one row into the start of the next, while Up/Down is measured off the boxes the
     * grid actually drew (see _rowStep) — the column count depends on how wide the editor is,
     * so it is not a number this component can do arithmetic with.
     */
    private _activeIndex;
    /** Focus the first tile, so the popover is usable from the keyboard on open. */
    firstUpdated(): void;
    /** The tiles in drawn order. Read from the DOM, because that IS the order arrows step. */
    private _tiles;
    private _focusTile;
    /**
     * Keep the tab stop on whatever the user last touched.
     *
     * Focus can land on a tile without an arrow key: a click, a Shift+Tab back in from the
     * pin. If the stop did not follow, Tab would leave from one tile while the arrows carried
     * on from another, and the first arrow press after a click would jump somewhere unrelated.
     */
    private _onFocusIn;
    /**
     * Where a key takes the focus, or null if this component has no answer for it.
     *
     * Clamped at both ends rather than wrapping. A gallery is a surface with a shape, not a
     * carousel: Right at the last tile wrapping to the first would lose the user's place in a
     * list six headings long, and the bottom of the list is where the arrow keys should stop.
     */
    private _nextIndex;
    /**
     * The tile one row down (dir 1) or up (dir -1), by geometry.
     *
     * Geometry rather than index arithmetic, because the column count is not a constant here:
     * the gallery is as wide as the editor tab, so a row holds nine tiles in a maximised window
     * and two in a narrow pane. Measuring the boxes also makes a heading no obstacle — the
     * nearest row above the first row of Types is the last row of Interfaces, which is exactly
     * where Up should go.
     *
     * Finds the nearest row edge in that direction, then the tile in it whose centre is closest
     * horizontally, so a column is held while moving down it. Returns `from` at the ends.
     *
     * Needs a layout engine, so it is the one part of this that happy-dom cannot exercise: every
     * box there is 0x0, every top is equal, and this correctly answers "no row that way". It is
     * checked in the browser harness instead.
     */
    private _rowStep;
    private _onTile;
    private _onPin;
    private _close;
    private _onKeyDown;
    render(): import("lit-html").TemplateResult<1>;
    private _renderTile;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-add-gallery': DexAddGallery;
    }
}
