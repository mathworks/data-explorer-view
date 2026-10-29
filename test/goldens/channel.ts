// Copyright 2026 The MathWorks, Inc.
//
// Two ends of a message channel, as a webview's or a worker's is: every message structured-cloned,
// and delivered in a task of its own, in order. With `transfer`, a port's postMessage also takes a
// transfer list, as a worker's does, and what it lists is moved: the sender's buffer is detached.
import type { TablePort } from '../../src/model/index.js';

export function channel(): [TablePort, TablePort] {
  const heard = [new Set<(m: unknown) => void>(), new Set<(m: unknown) => void>()];
  const end = (me: 0 | 1, other: 0 | 1): TablePort & { postMessage(message: unknown, transfer?: ArrayBuffer[]): void } => ({
    postMessage(message, transfer?: ArrayBuffer[]) {
      const copy = structuredClone(message, transfer ? { transfer } : undefined);
      setTimeout(() => {
        for (const listener of [...heard[other]]) listener(copy);
      }, 0);
    },
    onMessage(listener) {
      heard[me].add(listener);
      return () => void heard[me].delete(listener);
    },
  });
  return [end(0, 1), end(1, 0)];
}
