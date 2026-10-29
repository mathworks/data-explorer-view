// Copyright 2026 The MathWorks, Inc.
//
// What the extension's goldens write (its test/goldens/fixtures.ts snapshotText), so an answer
// too large to keep whole compares by its digest. Shared by the golden suites here.
import { createHash } from 'node:crypto';

const FULL_SNAPSHOT_LIMIT = 48 * 1024;
const DIGEST_HEAD = 20;
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/** A row list too large to keep, as the extension's goldens keep it: its hash, length and first rows. */
export const digestRows = (rows: unknown[]) => ({
  digested: true,
  sha256: sha256(JSON.stringify(rows, null, 1)),
  rowCount: rows.length,
  firstRows: rows.slice(0, DIGEST_HEAD),
});

/** The text a snapshot of answers by row id holds: whole, or past the limit, a digest of each answer. */
export function snapshotText(value: unknown): string {
  const full = JSON.stringify(value, null, 1);
  if (full.length <= FULL_SNAPSHOT_LIMIT) return full + '\n';
  const entries = Object.entries(value as Record<string, unknown>);
  const digest = {
    digested: true,
    sha256: sha256(full),
    entryCount: entries.length,
    entries: Object.fromEntries(entries.map(([id, answer]) => [id, sha256(JSON.stringify(answer, null, 1)).slice(0, 16)])),
  };
  return JSON.stringify(digest, null, 1) + '\n';
}
