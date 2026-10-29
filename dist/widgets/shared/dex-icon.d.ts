import { LitElement } from 'lit';
/**
 * Tells every `<dex-icon>` where the icon files are: the URL of a folder holding the files of
 * this package's `icons/` (`data-explorer-view/icons/*`), to which `<id>.svg` is appended. A
 * relative URL resolves as any `<img src>` does, against the page's base URL.
 *
 * The default is the package's own folder, found from this module's URL. That holds wherever
 * the package's files are served as they are installed — a static server, an import map, a
 * dev server that does not bundle dependencies. A bundler moves this module into a chunk of its
 * own, from which that path leads nowhere: an app that bundles copies the icons to where it
 * serves its assets and calls this with that folder, before the first icon renders, since
 * nothing redraws the icons already on the page.
 */
export declare function setIconBase(url: string): void;
export declare class DexIcon extends LitElement {
    static styles: import("lit").CSSResult[];
    iconId: string;
    size: number;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-icon>`, or under `tag`. */
export declare function defineIcon(tag?: string): void;
declare global {
    interface HTMLElementTagNameMap {
        'dex-icon': DexIcon;
    }
}
