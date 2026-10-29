// Copyright 2026 The MathWorks, Inc.

import { noChange } from 'lit';
import { Directive, PartType, directive, type ElementPart, type PartInfo } from 'lit/directive.js';

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
class StylePropsDirective extends Directive {
  private readonly _written = new Map<string, string>();

  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) {
      throw new Error('styleProps goes on an element, as <div ${styleProps({…})}>, not in an attribute');
    }
  }

  render(_props: StyleProps): unknown {
    return noChange;
  }

  override update(part: ElementPart, [props]: [StyleProps]): unknown {
    const { style } = part.element as HTMLElement;
    for (const name of [...this._written.keys()]) {
      if (props[name] == null) {
        style.removeProperty(name);
        this._written.delete(name);
      }
    }
    for (const [name, value] of Object.entries(props)) {
      if (value == null || this._written.get(name) === value) continue;
      // Removed first, so a value the browser refuses leaves the property unset, as the attribute
      // it replaces did (a new style attribute drops every declaration of the old one), rather than
      // keeping the value before it.
      style.removeProperty(name);
      style.setProperty(name, value);
      this._written.set(name, value);
    }
    return noChange;
  }
}

export const styleProps = directive(StylePropsDirective);
