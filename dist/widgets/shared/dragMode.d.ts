export type DragMode = 'copy' | 'move';
/** True for macOS/iOS platform strings (navigator.platform or userAgentData). */
export declare function isMacPlatform(platform: string): boolean;
/** The drag mode for the given platform and the modifier keys currently held. */
export declare function dragModeFromModifiers(platform: string, mods: {
    altKey: boolean;
    ctrlKey: boolean;
}): DragMode;
