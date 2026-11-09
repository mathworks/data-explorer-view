// Copyright 2026 The MathWorks, Inc.
//
// Renders a <dex-icon> from a BUILT module in plain Node — no Vite, no vitest transform — and
// prints its <img> src, one process for them all, as JSON: `own`, from the module's own icon base;
// `after`, from each base given, set by setIconBase after defineIcon; and `before`, from each base
// set before defineIcon, by a second instance of the module (its own base and class) defined under
// a tag of its own. happy-dom supplies the DOM as globals; run with `--conditions=browser` so lit
// resolves to its browser build, as a page's import map would give it.
// Usage: node --conditions=browser renderIconInPlainNode.mjs <module path> <icon id> [base...]
import { pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';

const [modulePath, iconId, ...bases] = process.argv.slice(2);
const window = new Window({ url: 'http://localhost/app/' });
for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in globalThis)) {
    try {
      globalThis[key] = window[key];
    } catch {
      // A read-only global Node already has; Node's own serves.
    }
  }
}
globalThis.window = window;
globalThis.document = window.document;

/** The src of a new `<tag>` drawing the icon. */
async function draw(tag) {
  const el = document.createElement(tag);
  document.body.appendChild(el);
  el.iconId = iconId;
  await el.updateComplete;
  return el.shadowRoot.querySelector('img').getAttribute('src');
}

const url = pathToFileURL(modulePath).href;
const icons = await import(url);
icons.defineIcon();
const own = await draw('dex-icon');
const after = [];
for (const base of bases) {
  icons.setIconBase(base);
  after.push(await draw('dex-icon'));
}
const before = [];
for (const [i, base] of bases.entries()) {
  const again = await import(`${url}?before-define=${i}`);
  // A module of its own, whose base nothing has set yet: else this would draw the base set above.
  if (again.DexIcon === icons.DexIcon) throw new Error('the second import is the first module again');
  again.setIconBase(base);
  again.defineIcon(`dex-icon-${i}`);
  before.push(await draw(`dex-icon-${i}`));
}
process.stdout.write(JSON.stringify({ own, after, before }));
await window.happyDOM.close();
