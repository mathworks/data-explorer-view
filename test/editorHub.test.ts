// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test/editorHub.test.ts at cc8cb1b.
// Only its "propagates an async deleter that rejects" case, run against a createRegisters() instance's
// deleteFromSource (src/model/edit/registers.ts); its webview, broadcast and Add gallery cases test the
// extension's own hub and stay with it, and its other source-delete cases are not part of this port.
//
// The cross-provider hub (editorHub.ts) is what lets the JSON and binary table
// editors share one clipboard/drag broadcast fan-out and one cross-document
// source-delete dispatch. These tests pin that contract with fake webviews and
// a fake deleter — no VS Code needed (the hub only duck-types webview.postMessage).
import { describe, it, expect, beforeEach } from 'vitest';
import { createRegisters } from '../src/model/index.js';

// The extension's hub is module-level; view's source deleters are a createRegisters() instance's.
const registers = createRegisters();
const { registerSourceDeleter, unregisterSourceDeleter, deleteFromSource, clearClipboard, clearDrag } = registers;

beforeEach(() => {
  clearClipboard();
  clearDrag();
});

describe('editorHub — cross-document source delete dispatch', () => {
  it('propagates an async deleter that rejects', async () => {
    // The realistic shape: applyEdit returns a rejected promise rather than
    // throwing synchronously.
    registerSourceDeleter('mem://boom-async', async () => {
      await new Promise((r) => setTimeout(r, 1));
      throw new Error('applyEdit failed');
    });
    try {
      await expect(deleteFromSource('mem://boom-async', ['A'])).rejects.toThrow('applyEdit failed');
    } finally {
      unregisterSourceDeleter('mem://boom-async');
    }
  });
});
