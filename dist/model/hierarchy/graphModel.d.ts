export type SourceType = 'model' | 'sldd' | 'mat' | 'project';
export type NodeKind = SourceType | 'missing' | 'group';
export type GroupKind = 'external-data' | 'project' | 'folder';
export interface GraphSource {
    uriString: string;
    path: string;
    type: SourceType;
    slddRefs: string[];
    modelRefs: string[];
    dataSources: string[];
    dataDictionary: string | null;
    projectFiles?: string[];
    projectRefs?: string[];
}
export interface GraphNode {
    kind: NodeKind;
    uriString?: string;
    label: string;
    ancestors: ReadonlySet<string>;
    cycle: boolean;
    hasChildren: boolean;
    groupKind?: GroupKind;
    groupKey?: string;
}
export declare class RelGraph {
    private readonly sources;
    private readonly byBasename;
    private readonly groupOf;
    private readonly groups;
    constructor(sources: GraphSource[]);
    private computeGroups;
    resolve(ref: string): string[];
    resolveFor(ref: string, referrer: string | undefined): string[];
    private outgoingRefs;
    referencedUriStrings(): Set<string>;
    private static groupRank;
    roots(): GraphNode[];
    private toGroupNode;
    private groupRoots;
    children(node: GraphNode): GraphNode[];
    private hasDataLinks;
    private hasExpandableRefs;
    private dataLinkChildren;
    private refToNodes;
    private toNode;
}
