import { LitElement } from 'lit';
/**
 * What `dex-gallery-add` carries: the tile's class, its section ('' for a MAT-file's variable, a
 * section of the file's own by its key otherwise) and its label, as the Add gallery's
 * `dex-add-tile` names them.
 */
export interface GalleryAddDetail {
    className: string;
    section: string;
    label: string;
}
/**
 * The app shell's Gallery panel: the Add gallery's tiles as a palette that is always open, under
 * a heading naming the file an add lands in ("Add to plant.sldd"). A click on a tile sends
 * `dex-gallery-add` with its class and section, for the app to add one entry to the active file
 * (a document's `addEntry`); the panel adds nothing itself.
 *
 * `classes` and `sections` are the Add gallery's, forwarded: a dictionary's every tile by
 * default, a MAT-file's or a model's classes where they are given. While `disabled`, a note says
 * why (`note`: what to open, by default), and the tiles are shown but take no press and no focus.
 *
 * @tagname dex-gallery-panel
 */
export declare class DexGalleryPanel extends LitElement {
    static styles: import("lit").CSSResult[];
    /**
     * The classes a MAT-file or a model's workspace can take a new variable of (a TableView's
     * `add.classes`), or null for a dictionary's every tile. The Add gallery's `classes`, forwarded.
     * Default null. Property only.
     */
    classes: readonly string[] | null;
    /**
     * With `classes`, the sections beside the file's variables whose every tile is offered too (a
     * TableView's `addSections`: a model's `config`). The Add gallery's `sections`, forwarded.
     * Default null: none. Property only.
     */
    sections: readonly string[] | null;
    /**
     * The name of the file an add lands in, the active one: the heading reads "Add to" it. Default
     * empty, and the heading reads "Add". Attribute `target`.
     */
    target: string;
    /**
     * Whether the active file takes no new entry (none is open, or it is a project): a note says to
     * open a dictionary, a MAT-file or a model, and the tiles are shown faded and send nothing.
     * Default false. Attribute `disabled`.
     */
    disabled: boolean;
    /**
     * What the note says while `disabled`: why no entry can be added, as the app knows it ("plant.mdl
     * takes no edits."). Default 'Open a dictionary, a MAT-file or a model to add entries.'.
     * Attribute `note`.
     */
    note: string;
    private _onTile;
    render(): import("lit-html").TemplateResult<1>;
}
/**
 * Registers the widget as `<dex-gallery-panel>`, or under `tag`, after the `<dex-add-gallery>` it
 * draws (and the `<dex-icon>` the gallery's tiles draw).
 */
export declare function defineGalleryPanel(tag?: string): void;
/**
 * The events `<dex-gallery-panel>` sends, by name. They bubble and are composed, so they reach the
 * document and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend
 * this map, and a listener on an element, the document or the window is typed.
 */
export interface GalleryPanelEventMap {
    /**
     * A tile was clicked: add one entry of its class, in its section, to the active file. Not sent
     * while the panel is disabled. The Add gallery's own `dex-add-tile` does not leave the panel.
     * A request.
     */
    'dex-gallery-add': CustomEvent<GalleryAddDetail>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-gallery-panel': DexGalleryPanel;
    }
    interface HTMLElementEventMap extends GalleryPanelEventMap {
    }
    interface DocumentEventMap extends GalleryPanelEventMap {
    }
    interface WindowEventMap extends GalleryPanelEventMap {
    }
}
