// Copyright 2026 The MathWorks, Inc.
// `data-explorer-view/hierarchy`: a folder's hierarchy as a tree, and connectHierarchy, which
// feeds one from a FolderHierarchy (`data-explorer-view/model`). defineHierarchy defines the
// icon its rows draw too.
export { DexHierarchy, defineHierarchy } from './dex-hierarchy.js';
export { connectHierarchy } from './connectHierarchy.js';
export type { ConnectHierarchyOptions, HierarchyHandle, HierarchyHandleEventMap } from './connectHierarchy.js';
export type { HierarchyEventMap, HierarchyItem, HierarchySelectDetail } from './dex-hierarchy.js';
