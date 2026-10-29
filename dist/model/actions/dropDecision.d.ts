export type DragMode = 'copy' | 'move';
export type DropCursor = 'copy' | 'move' | 'no-drop';
export interface DragItem {
    className: string;
    arrayClass: string;
    kind: string;
    isMatlabVariable: boolean;
    isScalarNumeric: boolean;
    sectionName?: string;
    sharedName?: boolean;
}
export interface DragSource {
    docUri: string;
    items: DragItem[];
}
export interface DropTarget {
    docUri: string;
    sectionName: string;
    sectionLabel: string;
    isDerived: boolean;
    allowedTypes: string[];
}
export interface DropDecision {
    canDrop: boolean;
    cursor: DropCursor;
    tooltip: string;
    noop: boolean;
}
export declare function rejectReason(target: DropTarget, item: DragItem): string | null;
export declare function isNoopMove(source: DragSource, target: DropTarget, mode: DragMode): boolean;
export declare function dropDecision(source: DragSource, target: DropTarget, mode: DragMode): DropDecision;
