// Copyright 2026 The MathWorks, Inc.
//
// Renders a <dex-icon> from a BUILT module in plain Node — no Vite, no vitest transform — and
// prints its <img> src: first from the module's own icon base, then from each base given, set by
// setIconBase, one process for them all. Printed as a JSON array of the srcs. happy-dom supplies
// the DOM as globals; run with `--conditions=browser` so lit resolves to its browser build, as a
// page's import map would give it.
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

const { defineIcon, setIconBase } = await import(pathToFileURL(modulePath).href);
defineIcon();
const srcs = [];
for (const base of [undefined, ...bases]) {
  if (base !== undefined) setIconBase(base);
  const el = document.createElement('dex-icon');
  document.body.appendChild(el);
  el.iconId = iconId;
  await el.updateComplete;
  srcs.push(el.shadowRoot.querySelector('img').getAttribute('src'));
}
process.stdout.write(JSON.stringify(srcs));
await window.happyDOM.close();
