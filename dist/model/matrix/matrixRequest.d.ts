import { matrixPayload } from './matrixPayload.js';
/**
 * Just the one method of `vscode.Webview` this needs, structurally. Deliberately not
 * `Pick<vscode.Webview, 'postMessage'>`: importing `vscode` would put this module in
 * the set vitest cannot load (see vitest.config.ts), and the rule it holds is exactly
 * the kind this repo keeps in a vscode-free sibling so it can be tested directly.
 */
interface Poster {
    postMessage(message: unknown): unknown;
}
/**
 * The `matrixCells` envelope for a node, or for the absence of one. The whole of the
 * rule, so that the Property Inspector — which is handed a node and never learns
 * which document it came from, so it cannot use `answerMatrixRequest` below — still
 * answers in the same words. Total: never throws.
 *
 * `node` is the ROW's node, so `matrixPayload` re-runs its own `matrixForRow` here (a
 * property row's matrix lives on its `Value` child). No caller resolves the owner;
 * that rule stays in one place.
 */
export declare function matrixCellsMessage(nodeId: string, node: any): {
    type: 'matrixCells';
    nodeId: string;
    matrix?: ReturnType<typeof matrixPayload>;
    message?: string;
};
/**
 * Answer a webview's `requestMatrix` on the webview it came from. Total: never
 * throws, and always posts exactly one `matrixCells` — a panel that is already open
 * and waiting is worse off with silence than with a reason.
 */
export declare function answerMatrixRequest(webview: Poster, uriString: string, nodeId: string): void;
export {};
