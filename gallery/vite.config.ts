// The gallery's build: one HTML page per widget, the composed page and the index. It imports
// data-explorer-view by its package name, which resolves to this repository through the
// package's own `exports` (a self-reference), so every page runs the committed dist/ exactly
// as an app that installs the package does.
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const root = import.meta.dirname;
const pages = Object.fromEntries(
  readdirSync(root)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f.slice(0, -'.html'.length), resolve(root, f)]),
);

// Every page under a strict Content-Security-Policy, so a widget that writes an inline style or
// loads from elsewhere shows up as a console error, which the tests fail on. The dev server
// injects each stylesheet as a <style> element, so its pages alone also allow inline styles; a
// build links them as files.
const POLICY =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; " +
  "connect-src 'self'; base-uri 'none'; form-action 'none'";

function contentSecurityPolicy(): Plugin {
  let serving = false;
  return {
    name: 'gallery-csp',
    configResolved(config) {
      serving = config.command === 'serve';
    },
    transformIndexHtml() {
      const policy = serving ? POLICY.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'") : POLICY;
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }];
    },
  };
}

export default defineConfig({
  root,
  // Pages, not one page with routes: a path that names no file is a 404, not index.html, so a
  // missing icon or fixture fails the request the tests watch.
  appType: 'mpa',
  // Relative, so the built gallery works from any folder it is copied to.
  base: './',
  optimizeDeps: {
    // As view's README says: a pre-bundled copy of the package is no longer beside its icons.
    // (Here the package resolves to this repository, outside node_modules, which Vite never
    // pre-bundles; an app that installs it needs the line.)
    exclude: ['data-explorer-view'],
    // Left out, the package is not scanned for what it imports either. Without this list the
    // dev server finds these as the first page asks for them, optimizes again and reloads the
    // page. tests/devServer.spec.ts holds it to what dist/ imports.
    include: ['data-explorer-core', 'lit', 'lit/decorators.js', 'lit/directive.js', 'lit/directives/live.js'],
  },
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    // Every icon and fixture a file, none a data: URL: `img-src 'self'` holds, and the tests see
    // each icon load.
    assetsInlineLimit: 0,
    // The fixtures and the project store make the pages bigger than Vite's warning threshold.
    chunkSizeWarningLimit: 2000,
    rolldownOptions: { input: pages },
  },
  plugins: [contentSecurityPolicy()],
});
