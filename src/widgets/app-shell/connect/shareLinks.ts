// Copyright 2026 The MathWorks, Inc.
//
// The shell's Open from URL…, for a host that fetches files from web addresses (ShellHost.fetchUrl):
// what it asks, in the shell's own dialog, since a page has no prompt of its own and the Electron
// app's native one would not say what an address is to be. The host does the fetching, under its
// own rules (the browser host's: https:, a data file, a size and a time), and says why one was not
// fetched; the shell asks, opens the path the host answers, and says what the host said. DOM-free.

import type { PromptOptions } from '../dex-confirm-dialog.js';

/** What Open from URL… asks. */
export const OPEN_URL_PROMPT: PromptOptions = {
  title: 'Open from URL',
  message: 'The web address of a data dictionary, model or MAT-file. A GitHub or GitLab file page works too.',
  label: 'URL',
  placeholder: 'https://',
  type: 'url',
  okLabel: 'Open',
};
