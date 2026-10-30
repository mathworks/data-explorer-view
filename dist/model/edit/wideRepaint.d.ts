/** What a wide repaint read when it began, or what the view says when its rows are ready. */
export interface WideState {
    /** The view's count of wide repaints begun. */
    epoch: number;
    /** The document's version. */
    version: number;
    /** The view's count of narrow repaints and out-of-step declarations. */
    touched: number;
}
/**
 * What to do with a wide repaint's rows once they are built: post them ('land'), drop them for a
 * newer repaint's ('superseded'), or read the document again ('reread').
 */
export type WideLanding = 'land' | 'superseded' | 'reread';
export declare function wideLanding(read: WideState, now: WideState): WideLanding;
