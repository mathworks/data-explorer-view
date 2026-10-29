import { type ParseWarning, type SlddScanResult } from 'data-explorer-core';
/**
 * The parsed content of a .sldd, in whichever of the two on-disk formats its BYTES
 * are — never its extension, which both formats share.
 *
 * Throws on corrupt input, for either format: a caller that wants to skip an
 * unreadable file catches, and one that opens a single file lets the throw become the
 * "Failed to parse" banner.
 *
 * `warnings`, when a caller brings one, collects what the read survived — core's own
 * out-parameter convention, and the array the caller then hands to
 * `DataModel.addDataSource` so the node layer appends its findings to the SAME list
 * and one file reports one list. A caller with nothing to report it to passes
 * nothing, and the fatal warning is refused either way.
 */
export declare function readSlddContent(bytes: ArrayBuffer, warnings?: ParseWarning[]): Record<string, unknown>;
/**
 * A dictionary's entry NAMES and referenced sub-dictionaries, without building its entry
 * tree — core's `scanSldd`, under this host's same refusal policy.
 *
 * For the two workspace-wide scans (the name index and the relationship graph), which
 * between them read one string per entry out of a full DOM parse. Core measures the
 * compressed spelling at 3230 ms deep against ~115 ms scanned, and holds 1.7 MB where the
 * parse holds 62.8 MB heap plus 142.6 MB off-heap. The textual spelling is unchanged by
 * design: a scanner for it was written and measured SLOWER than `JSON.parse`.
 *
 * THE POLICY IS THE REASON THIS WRAPPER EXISTS, and it is not decoration. Core's scanner
 * falls back to the full read for any dictionary it was not verified against, and that
 * read RECOVERS from an unreadable `data/chunk0.xml` by answering an empty dictionary with
 * a warning. Calling core directly would therefore turn a truncated file into a dictionary
 * with no entries — silently contributing nothing to the name index and no edges to the
 * graph, with nothing to see. `refuseIfUnreadable` is what makes it a failure instead, and
 * it works here for a checked reason: across every adversarial shape core tests, the scan
 * never SUCCEEDS where the full parse refuses, so the warnings this collects are the same
 * ones `readSlddContent` above would have collected.
 */
export declare function scanSldd(bytes: ArrayBuffer, warnings?: ParseWarning[]): SlddScanResult;
/**
 * The same read for a live `data/chunk0.xml` string plus the pass-through zip parts —
 * what the writable binary editor holds between edits, with no zip round-trip.
 *
 * Same rule, and it is load-bearing at every one of that provider's call sites: the
 * paint path would render a table with zero rows for a dictionary it could not read
 * instead of the "Failed to parse" banner, and the save gate would zip that
 * reads-as-empty content over a good file on disk.
 */
export declare function readSlddParts(chunkXml: string, zipMeta: Record<string, Uint8Array>, warnings?: ParseWarning[]): Record<string, unknown>;
