import { LitElement } from 'lit';
/** One place on the path the location bar draws: a file, a section, an entry. */
export interface LocationSegment {
    /** What the segment reads, as text. */
    label: string;
    /** The id of the icon drawn before the label (an icon of `icons/`, or a data-model kind). None, the default, draws none. */
    icon?: string;
    /**
     * The segment's tooltip: more than the label says (a file's full path), or the whole label for
     * a bar narrow enough to clip it. None, the default, shows none.
     */
    title?: string;
    /**
     * A place only looked at, not gone to (a file selected in a graph): drawn dimmed after the
     * current place, which is the segment before it. A press on it asks to go there, as on any.
     * Off, the default, is a place on the way to where the user is.
     */
    preview?: boolean;
    /**
     * What a screen reader hears of the segment past its label: why it is drawn as it is ('selected
     * in the graph', for a preview). None, the default, says nothing more.
     */
    description?: string;
}
/** What `dex-location-go` carries: where the user asked to go. */
export interface LocationGoDetail {
    /** Back, Forward or Up was pressed; or a segment, by its index in `segments`. */
    to: 'back' | 'forward' | 'up' | number;
}
/**
 * The location bar: Back, Forward and Up, then a breadcrumb of where the user is, one segment
 * for each place on the way down to it ("Root › dd.sldd › Design Data"). It draws the segments
 * it is given, the last one as the current place, and turns each press into a request,
 * `dex-location-go`; it keeps no history and works out no path, so the app decides what each
 * request does, and says by `canBack`, `canForward` and `canUp` which buttons can be used. A
 * path too long for the bar shrinks its segments, each label ending in an ellipsis.
 *
 * @tagname dex-location-bar
 */
export declare class DexLocationBar extends LitElement {
    static styles: import("lit").CSSResult[];
    /** The places on the way to where the user is, the first at the top and the last the current place. Default none. */
    segments: LocationSegment[];
    /** Back can be used: there is a place to go back to. Off, the default, disables it. Attribute `can-back`. */
    canBack: boolean;
    /** Forward can be used: the user went back, and can go forward again. Off, the default, disables it. Attribute `can-forward`. */
    canForward: boolean;
    /** Up can be used: the current place is inside another one. Off, the default, disables it. Attribute `can-up`. */
    canUp: boolean;
    /**
     * Draws the icons of Back, Forward and Up in one colour, the text's (`<dex-icon mono>`), as a
     * toolbar's glyphs; off, the default, draws them in their files' colours. A segment's icon is a
     * file's or an entry's kind, which its colours tell apart, and keeps them either way. Attribute
     * `mono`, reflected so a page's stylesheet can follow it.
     */
    mono: boolean;
    private _go;
    private _segment;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-location-bar>`, or under `tag`, and the `<dex-icon>` its buttons and segments draw. */
export declare function defineLocationBar(tag?: string): void;
/**
 * The events `<dex-location-bar>` sends, by name. They bubble and are composed, so they reach the
 * document and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend
 * this map, and a listener on an element, the document or the window is typed.
 */
export interface LocationBarEventMap {
    /**
     * The user asked to move: Back, Forward or Up was pressed (only while `canBack`, `canForward`
     * or `canUp` says it can be), or a segment was, the last one included. The bar changes nothing
     * itself; the app moves, and gives it the new segments.
     */
    'dex-location-go': CustomEvent<LocationGoDetail>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-location-bar': DexLocationBar;
    }
    interface HTMLElementEventMap extends LocationBarEventMap {
    }
    interface DocumentEventMap extends LocationBarEventMap {
    }
    interface WindowEventMap extends LocationBarEventMap {
    }
}
