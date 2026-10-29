import { LitElement, type PropertyValues } from 'lit';
import { type ProjectPagePayload } from './projectPage.js';
/** What `dex-project-open` carries: a link the page cannot follow itself. */
export interface ProjectOpenDetail {
    /** The path the link names, relative to the project's folder (`models/plant.slx`, `../Lib/Lib.prj`). */
    path: string;
    /** Present on a component row: open the project in that folder, not the folder. */
    preferProject?: true;
}
/**
 * A MATLAB project's page: what it is, its startup and shutdown files, shortcuts, path, labels,
 * locations and the projects it references, from the message `projectPageMessage` builds. Each
 * section with many rows has a filter, and one past its cap a Show all; both are kept across a
 * new page of the same project (a store saved on disk), and dropped for another project. A link
 * to a file or a project is the app's to open: a click, Enter or Space sends `dex-project-open`.
 *
 * The page is in the element's shadow root with its stylesheet adopted, so it needs no
 * `style-src 'unsafe-inline'`, and the page's class names reach nothing else on the page.
 *
 * @tagname dex-project-page
 */
export declare class DexProjectPage extends LitElement {
    static styles: import("lit").CSSResult[];
    /**
     * The project shown: `projectPageMessage`'s answer (its `type` is ignored), or null for none.
     * A page of another project (another `root`) starts with every filter cleared; a page of the
     * same one keeps them. Setting it clears `error`.
     */
    payload: ProjectPagePayload | null;
    /** Why the project could not be shown, above the page; empty for nothing to say. Attribute `error`. */
    error: string;
    /**
     * The place a Locations link to a folder reveals it in, as the link's tooltip names it:
     * "Reveals `cache` in the Explorer". An app says where its own `dex-project-open` shows a
     * folder: `'Finder'`, `'the file manager'`. Default `'the Explorer'`. Attribute `reveal-in`.
     */
    revealIn: string;
    private _state;
    private _root;
    private _caret;
    protected willUpdate(changed: PropertyValues<this>): void;
    protected updated(): void;
    private _section;
    private _onInput;
    private _open;
    private _onClick;
    private _onKeydown;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-project-page>`, or under `tag`. */
export declare function defineProjectPage(tag?: string): void;
/**
 * The events `<dex-project-page>` sends, by name. They bubble and are composed, so they reach the
 * document and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend
 * this map, and a listener on an element, the document or the window is typed.
 */
export interface ProjectPageEventMap {
    /** A link to a file, a folder or a project was followed, by a click, Enter or Space. */
    'dex-project-open': CustomEvent<ProjectOpenDetail>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-project-page': DexProjectPage;
    }
    interface HTMLElementEventMap extends ProjectPageEventMap {
    }
    interface DocumentEventMap extends ProjectPageEventMap {
    }
    interface WindowEventMap extends ProjectPageEventMap {
    }
}
