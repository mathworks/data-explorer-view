// Copyright 2026 The MathWorks, Inc.
//
// The browser's ShellHost: what connectShell asks of a page, made of the browser host's pieces.
// Files are picked, dropped, read, saved and watched through one WebFiles; a picked or dropped
// folder is served in the page and handed to the shell as an Electron main process hands its page a
// port, and looked at again when the page is shown or its window focused, since a browser says
// nothing of a folder's changes. There are no native prompts: with no confirmClose or
// confirmReload, the shell asks about unsaved edits and changes on disk in its own dialog.
//
// Lifted from data-explorer-app src/web/host.ts (`webHost`) at b13a860. Since: every dependency
// defaults to the page's own; without `onFolder` the host shows no folders and without `onChanged`
// watches no files; a folder is looked at again at most once every LOOK_EVERY_MS; a drop opens
// through openDropped; and New's files are made in newFile.ts.

import { isSupportedPath } from 'data-explorer-core';
import type { ShellHost } from '../widgets/app-shell/connect/types.js';
import { dropSources, type DroppedItem } from './drop.js';
import { folderLooks, serveWebFolder, type WebFolderServer } from './folder.js';
import { WebFiles, type BrowserFile, type BrowserSource } from './files.js';
import type { FilePickers, UserActivation } from './fsAccess.js';
import { NewFiles } from './newFile.js';
import { pickDirectory, pickFiles } from './pick.js';
import { saveFile, saveFileAs } from './save.js';
import type { BrowserDir } from './walk.js';
import { watchOpenFiles, type OpenFileWatch } from './watch.js';

/**
 * The least time between two looks at a shown folder, in milliseconds. A window shown again is
 * often focused too, and each look reads every listed file's size and date; a look asked sooner
 * waits for the rest of the time rather than being dropped, so no change goes untold.
 */
export const LOOK_EVERY_MS = 3000;

/**
 * The files a browser host has, by the paths it made for them: what an app may do with them beside
 * the shell. A path is the host's own and opaque: an app opens the paths the host gives, and builds
 * or parses none of its own.
 */
export interface BrowserFiles {
  /**
   * Add a file of the app's own, bytes it fetched, say, as a pick of it alone: the path to open it
   * by (the shell's `openPaths`). A handle to a file the host has a path for already keeps that path.
   */
  addPicked(name: string, source: BrowserSource): Promise<string>;
  /**
   * Add files of the app's own to the group named `group` (any name the app chooses: `'samples'`):
   * the paths to open them by, in order. A group is one folder, made when its first file comes, and
   * every file added to it later sits beside the ones it has, so files fetched at different times
   * still find each other (a model's link to a dictionary, which names it alone). Two groups, and
   * every pick, are folders apart. A group holds one file of a name: a file of a name it has takes
   * that file's place, at its path, and a tab open on it takes the new file as it takes a change on
   * disk (through `onChanged`). The same file again (equal bytes, or a File of the same size and
   * date) changes nothing; still, a page adds a file once and keeps the paths it is answered, to
   * open again. A handle to a file the host has a path for already keeps that path.
   */
  addToGroup(group: string, files: readonly BrowserFile[]): Promise<string[]>;
  /** The file at `path`, or undefined for a path the host never made. */
  get(path: string): BrowserFile | undefined;
  /** Whether the host made `path`. */
  has(path: string): boolean;
}

/** What browserHost runs over. Each is the page's own unless given (a test gives fakes). */
export interface BrowserHostOptions {
  /** The pickers, and the window whose `focus` makes the host look at its folder again. Default `window`. */
  window?: FilePickers & Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  /** Where file inputs and download links are made, and whose `visibilitychange` and title the host uses. Default `document`. */
  document?: Document;
  /** Whether a click or a key press led to a dialog, and the clipboard. Default `navigator`. */
  navigator?: UserActivation & { clipboard?: Pick<Clipboard, 'writeText'> };
  /**
   * Show the folder served on `port` as `root`: the shell's `showFolder`. Absent: the host shows no
   * folders; it has no `pickFolder` (the shell then offers no Folder button), a dropped folder is
   * passed over, and `openFolder` does nothing.
   */
  onFolder?(root: string, port: MessagePort): void;
  /** An open file changed on disk: the shell's `fileChanged`. Absent: open files are not watched. */
  onChanged?(path: string): void;
}

/** The browser's ShellHost, and what a page drives it by beside connectShell. */
export interface BrowserHost extends ShellHost {
  /** The files the host has, by the paths it gave them. */
  readonly files: BrowserFiles;
  /**
   * Serve `dir` and show it (through `onFolder`), in place of a folder shown before. Resolves once
   * the folder has been looked at, for the next look to tell what changed since.
   */
  openFolder(dir: BrowserDir): Promise<void>;
  /**
   * Take what was dropped: its files, as one pick, resolve to the paths to open (the shell's
   * `openPaths`), and its first folder is shown, the paths not waiting for the folder to be looked
   * at. Call it from the drop's listener, before anything is awaited (a drop can be read only
   * then), as `installFileDrop(window, async (dt) => app.openPaths(await host.openDropped(dt)))` does.
   */
  openDropped(data: DataTransfer): Promise<string[]>;
  /** Whether a file has unsaved edits, as the shell last said: for `beforeunload` to ask. */
  readonly edited: boolean;
  /** Stop watching, looking and serving, and take the host's listeners away. */
  dispose(): void;
}

/** The folder shown: how it is served, how it is looked at again, and when it last was. */
interface Shown {
  served: WebFolderServer;
  look: () => Promise<string[]>;
  looking: boolean;
  /** A look was asked for while one ran: another follows it. */
  again: boolean;
  /** When the last look began (Date.now()). */
  last: number;
  /** A look waiting for LOOK_EVERY_MS to pass. */
  timer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * A ShellHost for a browser page: Open File and Open Folder through Chromium's pickers or file
 * inputs, New through its save picker or as a file the page keeps, reads and saves through WebFiles
 * (in place where the browser gives a handle, a download where it does not), open files watched, a
 * folder served in the page, and drops. The shell gets its folder and its files' changes back
 * through `onFolder` and `onChanged`; docs/browser-host.md says what works in which browser.
 */
export function browserHost(options: BrowserHostOptions = {}): BrowserHost {
  const files = new WebFiles();
  // The page's window has the pickers where the browser does (fsAccess.ts types them).
  const win: NonNullable<BrowserHostOptions['window']> = options.window ?? (window as Window & FilePickers);
  const doc = options.document ?? document;
  const nav = options.navigator ?? navigator;
  const deps = { window: win, document: doc, navigator: nav };
  const { onFolder, onChanged } = options;
  const watcher: OpenFileWatch | undefined = onChanged ? watchOpenFiles(files, onChanged, deps) : undefined;
  const made = new NewFiles(files, deps);
  // The files the shell has open, as it says: each it reads, and each New it is given, until it
  // closes it. A New over one is not written: the emptied file is the shell's to write back.
  const opened = new Set<string>();
  let shown: Shown | undefined;
  let edited = false;

  // A look at the shown folder: the files it touched the page reads again. One at a time; one asked
  // while another runs follows it.
  async function lookAt(folder: Shown): Promise<void> {
    if (folder.looking) {
      folder.again = true;
      return;
    }
    folder.looking = true;
    folder.last = Date.now();
    try {
      const uris = await folder.look();
      if (uris.length && folder === shown) folder.served.changed(uris);
    } finally {
      folder.looking = false;
      if (folder.again && folder === shown) {
        folder.again = false;
        lookSoon(folder);
      }
    }
  }

  // A look now, or once LOOK_EVERY_MS has passed since the last began, if the page is shown then.
  function lookSoon(folder: Shown): void {
    if (folder.timer !== undefined) return;
    const wait = folder.last + LOOK_EVERY_MS - Date.now();
    if (wait <= 0) return void lookAt(folder);
    folder.timer = setTimeout(() => {
      folder.timer = undefined;
      if (folder === shown && doc.visibilityState === 'visible') void lookAt(folder);
    }, wait);
  }

  const lookAgain = (): void => {
    if (shown && doc.visibilityState === 'visible') lookSoon(shown);
  };
  if (onFolder) {
    doc.addEventListener('visibilitychange', lookAgain);
    win.addEventListener('focus', lookAgain);
  }

  function stopShowing(): void {
    if (!shown) return;
    clearTimeout(shown.timer);
    shown.served.close();
    shown = undefined;
  }

  // Serve `dir` and hand it to the shell: its first look, which every later one is told against.
  async function showFolder(dir: BrowserDir): Promise<{ looked: Promise<void> }> {
    if (!onFolder) return { looked: Promise.resolve() };
    const root = await files.folderRoot(dir);
    stopShowing();
    const folder: Shown = {
      served: serveWebFolder(root, dir, files),
      look: folderLooks(root, dir),
      looking: false,
      again: false,
      last: 0,
      timer: undefined,
    };
    shown = folder;
    onFolder(root, folder.served.port);
    return { looked: lookAt(folder) };
  }

  async function openFolder(dir: BrowserDir): Promise<void> {
    await (await showFolder(dir)).looked;
  }

  // A write of the open file `path`, known by the stamp it leaves when it lands there.
  async function writing<T>(path: string, write: () => Promise<T>, landed: (result: T) => boolean): Promise<T> {
    watcher?.saving(path);
    let stamp: string | null = null;
    try {
      const result = await write();
      if (landed(result)) stamp = await files.stamp(path);
      return result;
    } finally {
      watcher?.ownWrite(path, stamp);
    }
  }

  return {
    // The registry's few members an app needs, and none of the rest.
    files: {
      addPicked: (name, source) => files.addPicked(name, source),
      async addToGroup(group, added) {
        const { paths, replaced } = await files.addToGroup(group, added);
        // A file replaced under a tab is a change on disk to it, told once: the watcher knows it by
        // the new file's stamp, so its next look does not tell it again.
        for (const path of replaced) {
          if (!watcher?.has(path)) continue;
          watcher.watch(path, await files.stamp(path));
          onChanged?.(path);
        }
        return paths;
      },
      get: (path) => files.get(path),
      has: (path) => files.has(path),
    },
    async newFile(suggestedName) {
      // The open files are not looked at while the picker is up: the one it names is made or emptied
      // as it closes, which is no other program's change, and a look meanwhile would report it.
      const paused = [...opened];
      for (const p of paused) watcher?.saving(p);
      let path: string | null = null;
      try {
        path = await made.make(suggestedName, (p) => opened.has(p));
      } finally {
        // A file on disk is watched from now on, as one read is, known by what is there now: the new
        // dictionary, or an open file as the picker left it, which is then no change to reload from.
        // The others are known as they were.
        const stamp = path !== null && !made.keeps(path) ? await files.stamp(path) : null;
        for (const p of paused) watcher?.ownWrite(p, p === path ? stamp : null);
        if (path !== null && !made.keeps(path)) watcher?.watch(path, stamp);
      }
      if (path !== null) opened.add(path);
      return path;
    },
    pickFiles: () => pickFiles(files, deps),
    ...(onFolder && {
      async pickFolder() {
        const dir = await pickDirectory(deps);
        if (dir) await openFolder(dir);
      },
    }),
    openFolder,
    async openDropped(data) {
      // Asked of the drop before anything is awaited.
      const dropped = await dropSources(data);
      const picked = dropped.filter((item): item is Extract<DroppedItem, { kind: 'file' }> => item.kind === 'file');
      const paths = await files.addPick(picked.map(({ name, source }) => ({ name, source })));
      // The first folder, as a desktop host shows the first of several dropped; the files open while
      // it is first looked at, which reads every listed file's size and date.
      const folder = dropped.find((item): item is Extract<DroppedItem, { kind: 'folder' }> => item.kind === 'folder');
      if (folder) await showFolder(folder.dir);
      return paths;
    },
    async readFile(path) {
      // Only data files are read, as a desktop host reads only those.
      if (!isSupportedPath(path)) throw new Error('Not a data file this app opens.');
      opened.add(path);
      // The stamp before the bytes: a write between the two is a change the next look reports.
      const stamp = await files.stamp(path);
      const bytes = await files.bytes(path);
      watcher?.watch(path, stamp);
      return bytes;
    },
    closeFile(path) {
      opened.delete(path);
      watcher?.unwatch(path);
    },
    // A new file the page keeps, with no save picker to have named one on disk, is downloaded.
    saveFile: (path, bytes) =>
      writing(path, async () => (made.keeps(path) ? made.save(path, bytes) : saveFile(files, path, bytes)), () => true),
    saveFileAs: (path, bytes) => writing(path, () => saveFileAs(files, path, bytes, deps), (to) => to?.path === path),
    setEdited(value) {
      edited = value;
    },
    get edited() {
      return edited;
    },
    setTitle: (title) => {
      doc.title = title;
    },
    async copyText(text) {
      if (!nav.clipboard) throw new Error('This browser gives the page no clipboard.');
      await nav.clipboard.writeText(text);
    },
    dispose() {
      if (onFolder) {
        doc.removeEventListener('visibilitychange', lookAgain);
        win.removeEventListener('focus', lookAgain);
      }
      watcher?.dispose();
      stopShowing();
    },
  };
}
