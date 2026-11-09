// Copyright 2026 The MathWorks, Inc.
//
// The parts of the File System Access API the browser host uses that TypeScript's DOM types lack:
// the pickers, the permission calls and a drop's handles (Chromium's, from the WICG draft rather
// than the WHATWG standard), and a directory's entries (typed only in the DOM.AsyncIterable lib,
// which this package does not take). Each is looked for before it is used: Firefox and Safari have
// none, and the host falls back to a file input, or a drop's entries, there. And how the browser
// answers when nothing comes of a picker, or of a request a click or a key press must lead to.
//
// Lifted from data-explorer-app src/web/fsAccess.ts at b13a860, with a drop's handle call added.

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
  showOpenFilePicker?(options: { multiple?: boolean; types?: FilePickerType[] }): Promise<FileSystemFileHandle[]>;
  /** Ask where to save: a handle the page may write. Rejects with an AbortError when cancelled. */
  showSaveFilePicker?(options: { suggestedName?: string; types?: FilePickerType[] }): Promise<FileSystemFileHandle>;
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
  userActivation?: { readonly isActive: boolean };
}

/** A dropped item's handle, where the browser gives one (Chromium's `getAsFileSystemHandle`). */
export interface DropItemHandle {
  /** The item's file or directory handle; called while the drop is handled, it resolves after. */
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}

/** The entries of `dir`, files and directories, in the order the browser lists them. */
export function entriesOf(dir: FileSystemDirectoryHandle): AsyncIterable<FileSystemHandle> {
  return (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values();
}

const nameOf = (err: unknown) => (err as { name?: unknown } | null)?.name;

/**
 * Whether `err` is a picker's answer when nothing was picked: the user cancelled it (AbortError), or
 * another picker was open already (Chromium's NotAllowedError, "File picker already active").
 */
export const pickedNothing = (err: unknown): boolean => nameOf(err) === 'AbortError' || nameOf(err) === 'NotAllowedError';

/** Whether `err` is the browser's refusal of what only a click or a key press may ask for (SecurityError). */
export const wantedGesture = (err: unknown): boolean => nameOf(err) === 'SecurityError';
