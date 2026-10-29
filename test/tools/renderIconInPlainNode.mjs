// Copyright 2026 The MathWorks, Inc.
//
// Renders one <dex-icon> from a BUILT module in plain Node — no Vite, no vitest transform — and
// prints its <img> src. happy-dom supplies the DOM as globals; run with `--conditions=browser`
// so lit resolves to its browser build, as a page's import map would give it.
// Usage: node --conditions=browser renderIconInPlainNode.mjs <module path> <icon id> [base]
import { pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';

const [modulePath, iconId, base] = process.argv.slice(2);
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
if (base !== undefined) setIconBase(base);
defineIcon();
const el = document.createElement('dex-icon');
document.body.appendChild(el);
el.iconId = iconId;
await el.updateComplete;
process.stdout.write(el.shadowRoot.querySelector('img').getAttribute('src'));
await window.happyDOM.close();
