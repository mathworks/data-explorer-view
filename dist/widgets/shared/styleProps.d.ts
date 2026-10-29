import { Directive, type ElementPart, type PartInfo } from 'lit/directive.js';
/** CSS property names as a stylesheet spells them (`min-width`, `--dex-…`), and their values. */
export type StyleProps = Readonly<Record<string, string | null | undefined>>;
/**
 * Sets an element's inline style through the CSSOM: `<div ${styleProps({ height: `${h}px` })}>`.
 *
 * Not a `style="…"` binding, and not Lit's styleMap. A page whose Content-Security-Policy leaves
 * `'unsafe-inline'` out of `style-src` refuses every style ATTRIBUTE a script writes, and styleMap
 * writes its first value as one (it renders a string the first time). A property set through
 * `element.style` is not an attribute, and no policy refuses it. It goes on the element rather than
 * in an attribute, so there is no attribute for anything to write.
 *
 * As an attribute binding does, it writes a property only when its value differs from the one
 * written last; a property no longer given (null or undefined) is removed.
 */
declare class StylePropsDirective extends Directive {
    private readonly _written;
    constructor(partInfo: PartInfo);
    render(_props: StyleProps): unknown;
    update(part: ElementPart, [props]: [StyleProps]): unknown;
}
export declare const styleProps: (_props: Readonly<Record<string, string | null | undefined>>) => import("lit-html/directive.js").DirectiveResult<typeof StylePropsDirective>;
export {};
