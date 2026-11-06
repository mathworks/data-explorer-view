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
import { dropSources } from './drop.js';
import { folderLooks, serveWebFolder } from './folder.js';
import { titleOfPath, WebFiles } from './files.js';
import { NewFiles } from './newFile.js';
import { pickDirectory, pickFiles } from './pick.js';
import { saveFile, saveFileAs } from './save.js';
import { watchOpenFiles } from './watch.js';
/**
 * The least time between two looks at a shown folder, in milliseconds. A window shown again is
 * often focused too, and each look reads every listed file's size and date; a look asked sooner
 * waits for the rest of the time rather than being dropped, so no change goes untold.
 */
export const LOOK_EVERY_MS = 3000;
/**
 * A ShellHost for a browser page: Open File and Open Folder through Chromium's pickers or file
 * inputs, New through its save picker or as a file the page keeps, reads and saves through WebFiles
 * (in place where the browser gives a handle, a download where it does not), open files watched, a
 * folder served in the page, and drops. The shell gets its folder and its files' changes back
 * through `onFolder` and `onChanged`; docs/browser-host.md says what works in which browser.
 */
export function browserHost(options = {}) {
    const files = new WebFiles();
    // The page's window has the pickers where the browser does (fsAccess.ts types them).
    const win = options.window ?? window;
    const doc = options.document ?? document;
    const nav = options.navigator ?? navigator;
    const deps = { window: win, document: doc, navigator: nav };
    const { onFolder, onChanged } = options;
    const watcher = onChanged ? watchOpenFiles(files, onChanged, deps) : undefined;
    const made = new NewFiles(files, deps);
    // The files the shell has open, as it says: each it reads, and each New it is given, until it
    // closes it. A New over one is not written: the emptied file is the shell's to write back.
    const opened = new Set();
    let shown;
    let edited = false;
    // A look at the shown folder: the files it touched the page reads again. One at a time; one asked
    // while another runs follows it.
    async function lookAt(folder) {
        if (folder.looking) {
            folder.again = true;
            return;
        }
        folder.looking = true;
        folder.last = Date.now();
        try {
            const uris = await folder.look();
            if (uris.length && folder === shown)
                folder.served.changed(uris);
        }
        finally {
            folder.looking = false;
            if (folder.again && folder === shown) {
                folder.again = false;
                lookSoon(folder);
            }
        }
    }
    // A look now, or once LOOK_EVERY_MS has passed since the last began, if the page is shown then.
    function lookSoon(folder) {
        if (folder.timer !== undefined)
            return;
        const wait = folder.last + LOOK_EVERY_MS - Date.now();
        if (wait <= 0)
            return void lookAt(folder);
        folder.timer = setTimeout(() => {
            folder.timer = undefined;
            if (folder === shown && doc.visibilityState === 'visible')
                void lookAt(folder);
        }, wait);
    }
    const lookAgain = () => {
        if (shown && doc.visibilityState === 'visible')
            lookSoon(shown);
    };
    if (onFolder) {
        doc.addEventListener('visibilitychange', lookAgain);
        win.addEventListener('focus', lookAgain);
    }
    function stopShowing() {
        if (!shown)
            return;
        clearTimeout(shown.timer);
        shown.served.close();
        shown = undefined;
    }
    // Serve `dir` and hand it to the shell: its first look, which every later one is told against.
    async function showFolder(dir) {
        if (!onFolder)
            return { looked: Promise.resolve() };
        const root = await files.folderRoot(dir);
        stopShowing();
        const folder = {
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
    async function openFolder(dir) {
        await (await showFolder(dir)).looked;
    }
    // A write of the open file `path`, known by the stamp it leaves when it lands there.
    async function writing(path, write, landed) {
        watcher?.saving(path);
        let stamp = null;
        try {
            const result = await write();
            if (landed(result))
                stamp = await files.stamp(path);
            return result;
        }
        finally {
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
                    if (!watcher?.has(path))
                        continue;
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
            for (const p of paused)
                watcher?.saving(p);
            let path = null;
            try {
                path = await made.make(suggestedName, (p) => opened.has(p));
            }
            finally {
                // A file on disk is watched from now on, as one read is, known by what is there now: the new
                // dictionary, or an open file as the picker left it, which is then no change to reload from.
                // The others are known as they were.
                const stamp = path !== null && !made.keeps(path) ? await files.stamp(path) : null;
                for (const p of paused)
                    watcher?.ownWrite(p, p === path ? stamp : null);
                if (path !== null && !made.keeps(path))
                    watcher?.watch(path, stamp);
            }
            if (path !== null)
                opened.add(path);
            return path;
        },
        pickFiles: () => pickFiles(files, deps),
        ...(onFolder && {
            async pickFolder() {
                const dir = await pickDirectory(deps);
                if (dir)
                    await openFolder(dir);
            },
        }),
        openFolder,
        async openDropped(data) {
            // Asked of the drop before anything is awaited.
            const dropped = await dropSources(data);
            const picked = dropped.filter((item) => item.kind === 'file');
            const paths = await files.addPick(picked.map(({ name, source }) => ({ name, source })));
            // The first folder, as a desktop host shows the first of several dropped; the files open while
            // it is first looked at, which reads every listed file's size and date.
            const folder = dropped.find((item) => item.kind === 'folder');
            if (folder)
                await showFolder(folder.dir);
            return paths;
        },
        async readFile(path) {
            // Only data files are read, as a desktop host reads only those.
            if (!isSupportedPath(path))
                throw new Error('Not a data file this app opens.');
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
        // The paths are this host's making: a tooltip says what each means to the user.
        pathTitle: titleOfPath,
        // A new file the page keeps, with no save picker to have named one on disk, is downloaded.
        saveFile: (path, bytes) => writing(path, async () => (made.keeps(path) ? made.save(path, bytes) : saveFile(files, path, bytes)), () => true),
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
            if (!nav.clipboard)
                throw new Error('This browser gives the page no clipboard.');
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
