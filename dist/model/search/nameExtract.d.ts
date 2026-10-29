export type EntryKind = 'sldd' | 'mat' | 'workspace' | 'block';
export interface NameRecord {
    name: string;
    sourceUri: string;
    sourceLabel: string;
    kind: EntryKind;
    selectName?: string;
    blockPath?: string;
}
export declare function namesFromSldd(names: readonly string[], sourceUri: string): NameRecord[];
export declare function namesFromMat(names: readonly string[], sourceUri: string): NameRecord[];
export declare function namesFromSlx(parsed: {
    workspace?: {
        name?: string;
    }[];
    blockParamUsages?: {
        blockName?: string;
        sid?: string;
        systemPath?: string;
    }[];
}, sourceUri: string): NameRecord[];
