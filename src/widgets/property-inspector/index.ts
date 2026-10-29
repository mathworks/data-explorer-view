// Copyright 2026 The MathWorks, Inc.
// `data-explorer-view/property-inspector`: the property inspector, the matrix glyph its Value
// rows draw, and connectInspector, which feeds one from a table's selection or a host's pages.
// definePropertyInspector defines the glyph too.
export { DexPropertyInspector, definePropertyInspector } from './dex-property-inspector.js';
export { connectInspector } from './connectInspector.js';
export type { ConnectInspectorOptions, InspectorHandle } from './connectInspector.js';
export type {
  PropertyChangedDetail,
  PropertyGroup,
  PropertyInspectorEventMap,
  PropertyNavigateDetail,
  PropertyRow,
} from './dex-property-inspector.js';
export { DexMatrixOpen, defineMatrixOpen } from '../shared/dex-matrix-open.js';
export type { MatrixOpenDetail, MatrixOpenEventMap } from '../shared/dex-matrix-open.js';
