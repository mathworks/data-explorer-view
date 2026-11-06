// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// defineShellWidgets(): every element connectShell draws, defined in one call, in a page that has
// defined none of them (this file's registry is its own). The shell, its views and actions; its
// parts; the modules' views; the four internal elements; and the widgets a document is shown in.
// A second call changes nothing and throws nothing. That the list is all connectShell draws is
// the shell tests' to say: their harness defines nothing else (test/shell/connect.test.ts walks
// what a shell drew).
import { describe, expect, it } from 'vitest';
import { defineShellWidgets } from '../src/widgets/app-shell/defineShellWidgets.js';

const TAGS = [
  // The shell, its views and actions, and the icons its buttons draw (defineAppShell's own).
  'dex-app-shell',
  'dex-shell-view',
  'dex-shell-action',
  'dex-icon',
  // Its parts.
  'dex-toolbar',
  'dex-location-bar',
  'dex-explorer',
  'dex-folder-bar',
  'dex-doc-tabs',
  'dex-settings-panel',
  'dex-about-panel',
  'dex-toast-host',
  'dex-confirm-dialog',
  // The modules' views.
  'dex-raw-viewer',
  'dex-search-panel',
  'dex-gallery-panel',
  'dex-command-window',
  'dex-log-panel',
  'dex-command-palette',
  'dex-relationship-graph',
  // The internal elements.
  'dex-shell-docs',
  'dex-shell-folder',
  'dex-shell-note',
  'dex-shell-status',
  // What a document, the folder and a project are shown in.
  'dex-tree-table',
  'dex-property-inspector',
  'dex-variable-editor',
  'dex-context-menu',
  'dex-error-dialog',
  'dex-hierarchy',
  'dex-project-page',
];

describe('defineShellWidgets', () => {
  it('defines every element connectShell draws, and a second call changes nothing', () => {
    expect(TAGS.filter((tag) => customElements.get(tag))).toEqual([]);
    defineShellWidgets();
    expect(TAGS.filter((tag) => !customElements.get(tag))).toEqual([]);
    const classes = TAGS.map((tag) => customElements.get(tag));
    expect(() => defineShellWidgets()).not.toThrow();
    expect(TAGS.map((tag) => customElements.get(tag))).toEqual(classes);
  });
});
