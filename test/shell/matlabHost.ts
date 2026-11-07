// Copyright 2026 The MathWorks, Inc.
//
// A fake MATLAB for the shell's tests (ShellHost.matlab): a status a test sets, listeners told of
// each change, and every command recorded and answered, plausibly by default or as a test queues.
// No MATLAB runs: what the shell asks of one and what it does with the answers is all that is
// tested here; the app's link and the MATLAB package are tested where they are.
import type {
  MatlabEvaluation,
  MatlabOpenedIn,
  MatlabStatus,
  MatlabUpdate,
  MatlabVariable,
  ShellMatlab,
} from '../../src/widgets/app-shell/connect/types.js';

export interface FakeMatlab extends ShellMatlab {
  /** Every call, in order: its name and argument. */
  calls: { name: string; arg?: unknown }[];
  /** Set the status, telling the listeners. */
  set(status: MatlabStatus): void;
  /** How the next call of `name` answers (queued, in turn); none: a plausible answer (open → undefined, evaluate → a value `3` double [1,1], …). */
  answer(name: keyof ShellMatlab, reply: unknown | Error): void;
}

/** A MATLAB connected, idle, with Simulink and its Data Explorer. */
export const CONNECTED: MatlabStatus = { state: 'connected', release: 'R2027a', pid: 4242, busy: false, dataExplorer: true, simulink: true };

/** A model's name from its path: `/work/plant.slx` → `plant`. */
const modelName = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]*$/, '');

export function fakeMatlab(status: MatlabStatus = { state: 'off' }): FakeMatlab {
  let now = status;
  const listeners = new Set<(status: MatlabStatus) => void>();
  const queued = new Map<string, unknown[]>();
  const calls: { name: string; arg?: unknown }[] = [];

  // A command's answer: the one queued for it, else `plain`; an Error queued is a rejection.
  function reply<T>(name: keyof ShellMatlab, arg: unknown, plain: T): Promise<T> {
    calls.push({ name, arg });
    const next = queued.get(name)?.shift();
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve((next === undefined ? plain : next) as T);
  }

  return {
    calls,
    set(next) {
      now = next;
      for (const listener of [...listeners]) listener(next);
    },
    answer(name, value) {
      queued.set(name, [...(queued.get(name) ?? []), value]);
    },
    // Read at every repaint and menu: not recorded, or the calls would be mostly these.
    status: () => now,
    on(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    showConnect() {
      calls.push({ name: 'showConnect' });
    },
    open: (target) => reply<void>('open', target, undefined),
    evaluate: (request) => reply<MatlabEvaluation>('evaluate', request, { value: { text: '3', class: 'double', size: [1, 1], truncated: false } }),
    updateDiagram: (model) => reply<MatlabUpdate>('updateDiagram', model, { model: modelName(model), ok: true, errors: [], warnings: [] }),
    toWorkspace: (request) => reply<MatlabVariable>('toWorkspace', request, { name: request.name, class: 'double', size: [1, 1] }),
    fromWorkspace: (request) => reply<MatlabVariable>('fromWorkspace', request, { name: request.name, class: 'double', size: [1, 1] }),
    openInDataExplorer: (request) => reply<MatlabOpenedIn>('openInDataExplorer', request, { app: 'dataExplorer', selected: true }),
  };
}
