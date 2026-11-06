/** One kind of file a picker offers: its description, and the extensions under a MIME type. */
export interface FilePickerType {
    /** What the picker calls these files ('Simulink data files'). */
    description?: string;
    /** The extensions, each with its dot, under a MIME type. */
    accept: Record<string, string[]>;
}
/** The pickers a window may have. Absent in Firefox and Safari. */
export interface FilePickers {
    /** Ask for files to open: their handles. Rejects with an AbortError when cancelled. */
    showOpenFilePicker?(options: {
        multiple?: boolean;
        types?: FilePickerType[];
    }): Promise<FileSystemFileHandle[]>;
    /**
     * Ask where to save: a handle the page may write. Rejects with an AbortError when cancelled.
     * Chromium makes the file named, or empties the one that was there, as it resolves.
     * `excludeAcceptAllOption`: only files of `types` may be named.
     */
    showSaveFilePicker?(options: {
        suggestedName?: string;
        types?: FilePickerType[];
        excludeAcceptAllOption?: boolean;
    }): Promise<FileSystemFileHandle>;
    /** Ask for a folder: its handle. Rejects with an AbortError when cancelled. */
    showDirectoryPicker?(): Promise<FileSystemDirectoryHandle>;
}
/** What a permission is asked or queried for. */
export interface PermissionMode {
    /** To read, or to read and write. */
    mode: 'read' | 'readwrite';
}
/** A handle's permission calls, where the browser has them. */
export interface HandlePermissions {
    /** Whether the page may already, without asking. */
    queryPermission?(mode: PermissionMode): Promise<PermissionState>;
    /** Ask the user. Rejects with a SecurityError when no click or key press led to it. */
    requestPermission?(mode: PermissionMode): Promise<PermissionState>;
}
/** Whether the page is answering a click or a key press, where the browser says (`navigator.userActivation`). */
export interface UserActivation {
    /** `isActive`: a click or a key press happened a moment ago (a few seconds, in Chromium). */
    userActivation?: {
        readonly isActive: boolean;
    };
}
/** A dropped item's handle, where the browser gives one (Chromium's `getAsFileSystemHandle`). */
export interface DropItemHandle {
    /** The item's file or directory handle; called while the drop is handled, it resolves after. */
    getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}
/** The entries of `dir`, files and directories, in the order the browser lists them. */
export declare function entriesOf(dir: FileSystemDirectoryHandle): AsyncIterable<FileSystemHandle>;
/**
 * Whether `err` is a picker's answer when nothing was picked: the user cancelled it (AbortError), or
 * another picker was open already (Chromium's NotAllowedError, "File picker already active").
 */
export declare const pickedNothing: (err: unknown) => boolean;
/** Whether `err` is the browser's refusal of what only a click or a key press may ask for (SecurityError). */
export declare const wantedGesture: (err: unknown) => boolean;
