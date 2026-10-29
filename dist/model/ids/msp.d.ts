/** What role an MSP project plays in a composition. */
export type MspRole = 
/** A simulatable component: private values of its own, plus a published interface. */
'component'
/** Shared types only: an interface for others to chain, with no private values. */
 | 'common';
/** One of the two dictionaries an MSP project keeps, and which half it is. */
export interface MspDictionary {
    kind: 'interface' | 'private';
    /** Project-root-relative path to the `.sldd`, as the store spells it. */
    path: string;
}
export interface MspProject {
    role: MspRole;
    /**
     * Interface first, because it is the half that is public. A `common` project has no
     * private dictionary at all, so this can hold one entry.
     */
    dictionaries: MspDictionary[];
    /**
     * The name of the shared `Simulink.ConfigSet` entry inside the interface dictionary,
     * when this project keeps one. Not a path: it is an entry, not a file.
     */
    sharedConfigSetName?: string;
    /**
     * Where these facts came from, in the words the page shows. Worth carrying while this
     * is a proof of concept: the two detection routes disagree in useful ways (a store
     * whose labels were stripped still has its config file, and vice versa), and a page
     * that says which one answered is a page that can be debugged from a screenshot.
     */
    evidence: string[];
}
/** English for a role, for the page's identity line. */
export declare const MSP_ROLE_LABEL: Record<MspRole, string>;
