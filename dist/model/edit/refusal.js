/** The dialog's title for each refused gesture. */
export const REFUSAL_TITLES = {
    addChild: 'Cannot Add Child',
    delete: 'Cannot Delete',
    add: 'Cannot Add',
};
/** Why core adds no child to the row `nodeId` names (addChildTo), or null where it adds one. */
export const addChildRefusal = (session, nodeId) => session.addChildRefusal(nodeId);
/**
 * Why core would not delete every row of `nodeIds`, or null where it deletes them all. The rows
 * are those the gesture deletes, after its plan has dropped any under another row it deletes, and
 * each is asked as deleteNodeById takes it: every editor removes a child on its own, and core's
 * answer for a batch (deleteNodesById) is about entries only.
 */
export function deleteRefusal(session, nodeIds) {
    for (const id of nodeIds) {
        const why = session.deleteRefusal(id);
        if (why !== null)
            return why;
    }
    return null;
}
/**
 * Why core adds no `className` to `containerId` (a dictionary's section by its id, a MAT-file by
 * its srcId), or null where it adds one.
 */
export const addEntryRefusal = (session, containerId, className) => session.addEntryRefusal(containerId, className);
/** The change that shows `reason`, core's refusal of `gesture`, described (srcId -> file name). */
export function refusedChange(gesture, reason, describe) {
    return { kind: 'refused', title: REFUSAL_TITLES[gesture], reason: describe(reason) };
}
/**
 * `text` with `srcId` spelled as `name`: what every editor shows of a message of core's, which can
 * name the source by its id (a node's id begins with it). The MAT-file editor's describe is this.
 */
export const describeSource = (srcId, name) => (text) => text.split(srcId).join(name);
