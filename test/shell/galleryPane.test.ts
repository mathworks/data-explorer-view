// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The Gallery view's wiring on its own (connect/galleryPane.ts), over a stand-in file: a tile
// pressed adds to the active file, asked again at the press; an add that fails, a cell editor's
// commit refused before it or the add itself, is said (the shell's toast and Log) and is never an
// unhandled rejection.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { connectGalleryPane, type GalleryTarget } from '../../src/widgets/app-shell/connect/galleryPane.js';
import { DexGalleryPanel, defineGalleryPanel } from '../../src/widgets/app-shell/modules/dex-gallery-panel.js';

beforeAll(() => defineGalleryPanel());
afterEach(() => document.body.replaceChildren());

function setUp(target: GalleryTarget | null) {
  const panel = new DexGalleryPanel();
  document.body.append(panel);
  const failed = vi.fn();
  const pane = connectGalleryPane(panel, { target: () => target, failed });
  const press = () => panel.dispatchEvent(new CustomEvent('dex-gallery-add', { detail: { className: 'Simulink.Parameter', section: 'design', label: 'Parameter' } }));
  return { panel, pane, failed, press };
}
const file = (add: GalleryTarget['add'], editable = true): GalleryTarget => ({ name: 'params.sldd', view: undefined, editable, add });

describe('connectGalleryPane', () => {
  it('adds the pressed tile to the active file, its Name open for a rename', async () => {
    const add = vi.fn(async () => undefined);
    const { press, failed } = setUp(file(add));
    press();
    expect(add).toHaveBeenCalledWith({ className: 'Simulink.Parameter', section: 'design', rename: true });
    await Promise.resolve();
    expect(failed).not.toHaveBeenCalled();
  });

  it('says an add that failed, rejected or thrown, rather than leaving it unhandled', async () => {
    const rejected = setUp(file(async () => Promise.reject(new Error('The cell editor holds a name the dictionary has.'))));
    rejected.press();
    await vi.waitFor(() => expect(rejected.failed).toHaveBeenCalledWith('Could not add to params.sldd: The cell editor holds a name the dictionary has.'));
    const thrown = setUp(
      file(() => {
        throw new Error('This document is read-only.');
      }),
    );
    thrown.press();
    await vi.waitFor(() => expect(thrown.failed).toHaveBeenCalledWith('Could not add to params.sldd: This document is read-only.'));
  });

  it('adds nothing to a file it does not edit, or with none', () => {
    const add = vi.fn();
    setUp(file(add, false)).press();
    setUp(null).press();
    expect(add).not.toHaveBeenCalled();
  });
});
