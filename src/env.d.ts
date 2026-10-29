// Copyright 2026 The MathWorks, Inc.
// What dex-icon reads from `import.meta.env`: the base URL the page serves its assets under,
// which the consumer's bundler supplies (Vite sets it). Only its type is declared here.
interface ImportMetaEnv {
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
