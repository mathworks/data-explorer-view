import type { Session } from 'data-explorer-core';
export type RefusedGesture = 'addChild' | 'delete' | 'add';
/** The dialog's title for each refused gesture. */
export declare const REFUSAL_TITLES: Readonly<Record<RefusedGesture, string>>;
/** The part of core's session the refusals ask. */
export type RefusalSession = Pick<Session, 'addChildRefusal' | 'deleteRefusal' | 'addEntryRefusal'>;
/** Why core adds no child to the row `nodeId` names (addChildTo), or null where it adds one. */
export declare const addChildRefusal: (session: RefusalSession, nodeId: string) => string | null;
/**
 * Why core would not delete every row of `nodeIds`, or null where it deletes them all. The rows
 * are those the gesture deletes, after its plan has dropped any under another row it deletes, and
 * each is asked as deleteNodeById takes it: every editor removes a child on its own, and core's
 * answer for a batch (deleteNodesById) is about entries only.
 */
export declare function deleteRefusal(session: RefusalSession, nodeIds: readonly string[]): string | null;
/**
 * Why core adds no `className` to `containerId` (a dictionary's section by its id, a MAT-file by
 * its srcId), or null where it adds one.
 */
export declare const addEntryRefusal: (session: RefusalSession, containerId: string, className: string) => string | null;
/** The change that shows `reason`, core's refusal of `gesture`, described (srcId -> file name). */
export declare function refusedChange(gesture: RefusedGesture, reason: string, describe: (text: string) => string): {
    kind: 'refused';
    title: string;
    reason: string;
};
/**
 * `text` with `srcId` spelled as `name`: what every editor shows of a message of core's, which can
 * name the source by its id (a node's id begins with it). The MAT-file editor's describe is this.
 */
export declare const describeSource: (srcId: string, name: string) => (text: string) => string;
