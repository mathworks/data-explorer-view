export declare function parseNavTarget(target: string): {
    name: string;
    source: string;
} | null;
export declare function parseFileTarget(target: string): string | null;
export type ScopedResolve = (ref: string, referrer: string) => Promise<string | undefined>;
export interface NavSourceLookups {
    scoped?: ScopedResolve;
    firstMatch: (ref: string) => Promise<string | undefined>;
}
export declare function resolveNavSource(source: string, referrer: string | undefined, lookups: NavSourceLookups): Promise<string | undefined>;
