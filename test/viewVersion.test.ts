// Copyright 2026 The MathWorks, Inc.
//
// VIEW_VERSION (src/model/version.ts): this package's version, for an app's About. An app built on
// view could say its own version and not view's: neither its exports nor its package.json is
// anything an app may import (the desktop app's About had its own version alone). The constant is
// written from package.json by scripts/gen-version.mjs, as the icon assets are written from icons/,
// so a release cannot bump one and ship the other.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VIEW_VERSION } from '../src/model/index.js';

const ROOT = process.cwd();
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

describe('VIEW_VERSION', () => {
  it("is package.json's version, on the model entry", () => {
    expect(VIEW_VERSION).toBe(PKG.version);
    expect(VIEW_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  // Typed string, not the literal: the API check reads an export's type, and a literal type would
  // be a changed type at every release.
  it('is declared a string, not the literal of this release', () => {
    expect(readFileSync(join(ROOT, 'src', 'model', 'version.ts'), 'utf8')).toContain(`export const VIEW_VERSION: string = '${PKG.version}';`);
  });

  it('is the module scripts/gen-version.mjs writes', () => {
    expect(() => execFileSync(process.execPath, [join(ROOT, 'scripts', 'gen-version.mjs'), '--check'], { encoding: 'utf8' })).not.toThrow();
  });
});
