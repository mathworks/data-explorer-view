// Copyright 2026 The MathWorks, Inc.
//
// The About popover's lines grouped into sections (src/model/shell/about.ts): the lines an app hands
// connectShell's `about`, some under a heading (Built on, Dependencies), as the prototype's About had
// its app's lines and then a Dependencies section.
//
// What it protects: an app's lines drawn in the app's order, each section once. An app that builds
// its list from parts (its own lines, then the versions it is built on, then a line it adds later)
// may put a section's lines apart; drawn as they come, the section's heading would show twice. And
// the lines with no section are under the app's name, first, wherever they are in the list.
import { describe, expect, it } from 'vitest';
import { aboutSections, type AboutLine } from '../src/model/shell/about.js';

const line = (label: string, section?: string): AboutLine => ({ label, value: `${label} value`, ...(section === undefined ? {} : { section }) });
const shape = (lines: AboutLine[]) => aboutSections(lines).map((s) => [s.heading, s.lines.map((l) => l.label)]);

describe('aboutSections', () => {
  it('the lines with no section first, then each section in the order its first line comes', () => {
    const lines = [line('Version'), line('view', 'Built on'), line('Build date'), line('core', 'Built on'), line('Lit', 'Dependencies')];
    expect(shape(lines)).toEqual([
      [null, ['Version', 'Build date']],
      ['Built on', ['view', 'core']],
      ['Dependencies', ['Lit']],
    ]);
  });

  it('hands the lines back as the app gave them', () => {
    const lines = [line('view', 'Built on')];
    expect(aboutSections(lines)[0]!.lines[0]).toBe(lines[0]);
  });

  it('only sections that have lines: none for no lines, no unsectioned part when every line has a section', () => {
    expect(aboutSections([])).toEqual([]);
    expect(shape([line('view', 'Built on')])).toEqual([['Built on', ['view']]]);
  });

  it('an empty section is none, and two sections differ by their exact text', () => {
    expect(shape([line('a', ''), line('b', 'Built on'), line('c', 'built on')])).toEqual([
      [null, ['a']],
      ['Built on', ['b']],
      ['built on', ['c']],
    ]);
  });
});
