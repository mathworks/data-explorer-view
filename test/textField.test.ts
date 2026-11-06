// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// What takes typing (src/widgets/shared/textField.ts): the one rule the table's chords and the app
// shell's keep to, so that a key a field owns is the field's wherever it is pressed. A text input,
// a textarea, a select (its letters pick an option) and an editable element take typing; a
// checkbox, a radio and the other inputs that take no text are gestures, as a button is.
import { describe, expect, it } from 'vitest';
import { isTextField } from '../src/widgets/shared/textField.js';

const input = (type: string) => Object.assign(document.createElement('input'), { type });

describe('isTextField', () => {
  it('is true for the fields that take typing', () => {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    for (const el of [input('text'), input('search'), input('number'), input('email'), document.createElement('input'), document.createElement('textarea'), document.createElement('select'), editable]) {
      expect(isTextField(el), `${el.tagName} ${(el as HTMLInputElement).type ?? ''}`).toBe(true);
    }
  });

  it('is false for a checkbox, a radio, the inputs that are buttons, and anything else', () => {
    for (const type of ['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'range', 'color']) {
      expect(isTextField(input(type)), type).toBe(false);
    }
    expect(isTextField(document.createElement('div'))).toBe(false);
    expect(isTextField(document.createElement('button'))).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});
