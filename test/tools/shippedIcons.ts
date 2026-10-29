// Copyright 2026 The MathWorks, Inc.
//
// The icon files this package ships: icons/, which every app serves (or copies) as the folder
// setIconBase names. Read off the cwd, as the other tests reading package files: vitest runs from
// the repo root, and under happy-dom import.meta.url is not a file URL.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** The file that ships as `<id>.svg`, or undefined when icons/ has none. */
export function shippedIcon(id: string): string | undefined {
  const file = join(process.cwd(), 'icons', `${id}.svg`);
  return existsSync(file) ? file : undefined;
}
