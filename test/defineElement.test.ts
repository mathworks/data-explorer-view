// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The one call every widget's define ends in. A name is in one of three states, and each has its
// own answer: free (define it); held by this class already (nothing to do, which is what lets
// two widgets share a part); held by another class (throw, naming both, because another
// library's element must never quietly stand in for ours).
import { describe, it, expect } from 'vitest';
import { defineElement } from '../src/widgets/shared/define.js';

describe('defineElement', () => {
  it('defines a free name', () => {
    class Free extends HTMLElement {}
    expect(customElements.get('x-free')).toBeUndefined();

    defineElement('x-free', Free);

    expect(customElements.get('x-free')).toBe(Free);
    expect(document.createElement('x-free')).toBeInstanceOf(Free);
  });

  it('does nothing when the name already holds this class', () => {
    class Shared extends HTMLElement {}
    defineElement('x-shared', Shared);

    expect(() => defineElement('x-shared', Shared)).not.toThrow();
    expect(customElements.get('x-shared')).toBe(Shared);
  });

  it('throws, naming the tag and both classes, when another class holds the name', () => {
    class Theirs extends HTMLElement {}
    class Ours extends HTMLElement {}
    customElements.define('x-taken', Theirs);

    expect(() => defineElement('x-taken', Ours)).toThrow(
      '<x-taken> is already defined as Theirs; it cannot also be Ours',
    );
    expect(customElements.get('x-taken')).toBe(Theirs);
  });

  it('says so when the class holding the name has none', () => {
    const anonymous = [class extends HTMLElement {}][0]!;
    class Ours extends HTMLElement {}
    customElements.define('x-anonymous', anonymous);

    expect(() => defineElement('x-anonymous', Ours)).toThrow(
      '<x-anonymous> is already defined as an anonymous class; it cannot also be Ours',
    );
  });
});
