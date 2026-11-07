// Copyright 2026 The MathWorks, Inc.
//
// What the shell makes of a MATLAB its host reaches (ShellHost.matlab): what the status bar says
// of it. The host's link does the talking (the Electron app's, to the MATLAB package it ships);
// the shell only says what is connected, and asks the host to show how to connect. Pure: no DOM,
// connectShell draws what this answers.

import type { MatlabStatus, ShellCommand } from './types.js';

/** The commands of a host's MATLAB: Connect to MATLAB…, and the six it carries out on a row or a file. */
const MATLAB_COMMANDS: ReadonlySet<string> = new Set<ShellCommand>([
  'matlab-connect',
  'matlab-open',
  'matlab-update-diagram',
  'matlab-evaluate',
  'matlab-to-workspace',
  'matlab-from-workspace',
  'matlab-data-explorer',
]);

/** Whether `id` is one of a MATLAB's commands, which a palette row or a native menu may send. */
export function isMatlabCommand(id: string): id is ShellCommand {
  return MATLAB_COMMANDS.has(id);
}

/**
 * What the status bar says of `status`, and its tooltip: nothing while off. A MATLAB busy running
 * something answers once it is done: the bar says so, rather than leave a command that waits for it
 * looking like a link that is gone.
 */
export function matlabLabel(status: MatlabStatus | undefined): { label: string; title: string } {
  if (status?.state !== 'connected') return { label: '', title: '' };
  const name = `MATLAB ${status.release}`;
  if (status.busy) return { label: `${name} (busy)`, title: `${name} is running something and answers once it is done` };
  return { label: name, title: `Connected to ${name} (process ${status.pid})` };
}
