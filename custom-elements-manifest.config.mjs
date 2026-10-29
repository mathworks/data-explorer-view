// Copyright 2026 The MathWorks, Inc.
//
// How `npm run build` writes custom-elements.json, the Custom Elements Manifest: every widget's
// tag, properties, attributes, methods, events and the CSS tokens it reads, as tools (and the
// docs in docs/widgets/) read them. It is the package's public API in one file, and CI's
// check:api compares it with the one in the last release tag (scripts/check-api.mjs).
//
// The widgets are read from src/, where their decorators still are; the paths written are the
// dist/ files a consumer loads. The icon-assets table is left out: a generated list of URLs,
// with nothing in it a tool reads.
import { dexManifestPlugin } from './scripts/cem-plugin.mjs';

export default {
  globs: ['src/widgets/**/*.ts'],
  exclude: ['src/widgets/icon-assets/assets.ts'],
  outdir: '.',
  litelement: true,
  plugins: [dexManifestPlugin()],
};
