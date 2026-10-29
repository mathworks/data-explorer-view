export type HealthState = 'cycle' | 'modified';
export declare const HEALTH_QUERY = "dexHealth";
export interface HealthDecoration {
    /** Badge text — VS Code allows at most 2 characters. */
    badge: string;
    /** A VS Code ThemeColor id (adapts to the active theme). */
    colorId: string;
    tooltip: string;
}
export declare const DECORATIONS: Record<HealthState, HealthDecoration>;
/** Encode a health state as a resourceUri query string, e.g. `dexHealth=cycle`. */
export declare function encode(state: HealthState): string;
/**
 * Decode a health state from a resourceUri query string. Returns null when the
 * query carries no (recognized) health state, so a plain file URI decorates as
 * nothing.
 */
export declare function decode(query: string | undefined): HealthState | null;
