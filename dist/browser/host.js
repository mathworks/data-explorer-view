// Copyright 2026 The MathWorks, Inc.
//
// The browser's ShellHost: what connectShell asks of a page, made of the browser host's pieces.
// Files are picked, dropped, read, saved and watched through one WebFiles; a picked or dropped
// folder is served in the page and handed to the shell as an Electron main process hands its page a
// port, and looked at again when the page is shown or its window focused, since a browser says
// nothing of a folder's changes. The Folder view moves within a picked folder, and only there: a
// page reaches no folder the user did not pick, so the folder above the picked one is none, and a
// folder of it shown is served with its files at the paths they had, for a tab open on one. There
// are no native prompts: with no confirmClose or confirmReload, the shell asks about unsaved edits
// and changes on disk in its own dialog.
//
// Lifted from data-explorer-app src/web/host.ts (`webHost`) at b13a860. Since: every dependency
// defaults to the page's own; without `onFolder` the host shows no folders and without `onChanged`
// watches no files; a folder is looked at again at most once every LOOK_EVERY_MS; a drop opens
// through openDropped; and New's files are made in newFile.ts. A page may open files from web
// addresses (fetchUrls, and Open from URL with `openFromUrl`), fetched under urls.ts's rules, and
// pass on its links to its files (`linkFor`, Copy Link).
import { isSupportedPath } from 'data-explorer-core';
import { dropSources } from './drop.js';
import { folderLooks, serveWebFolder } from './folder.js';
import { titleOfPath, WebFiles } from './files.js';
import { NewFiles } from './newFile.js';
import { pickDirectory, pickFiles } from './pick.js';
import { saveFile, saveFileAs } from './save.js';
import { fetchUrlBytes, urlTargetOf } from './urls.js';
import { subDir } from './walk.js';
import { watchOpenFiles } from './watch.js';
/**
 * The least time between two looks at a shown folder, in milliseconds. A window shown again is
 * often focused too, and each look reads every listed file's size and date; a look asked sooner
 * waits for the rest of the time rather than being dropped, so no change goes untold.
 */
export const LOOK_EVERY_MS = 3000;
/** `err` as an Error, its message what a problem line says. */
const asError = (err) => (err instanceof Error ? err : new Error(String(err)));
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
    // The folders picked or dropped this session, each by the root it is shown at, newest first: the
    // folders the Folder view moves within, and its recent ones.
    const picked = [];
    // The picked folder `path` is, or is in: the one whose root is the path, or begins it and a `/`.
    const pickedOf = (path) => picked.find((p) => path === p.root || path.startsWith(`${p.root}/`));
    // A folder of a picked one, as the host spells it (FolderEntry paths): no trailing `/`, no empty,
    // `.` or `..` segment. Any other spelling is no folder of it: served there, its files would be at
    // paths they never had (`/proj//a.sldd`), and a tab open on one would not find it.
    const spelledIn = (path, root) => path === root || !path.slice(root.length + 1).split('/').some((part) => part === '' || part === '.' || part === '..');
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
        // Picked again: first again, at the root it took back.
        const was = picked.findIndex((p) => p.root === root);
        if (was >= 0)
            picked.splice(was, 1);
        picked.unshift({ root, dir });
        return serve(root, dir);
    }
    // Serve the folder `dir` at `root`, a picked folder's or a folder of one, in place of the folder
    // shown before. A folder of a picked one is served at the picked root and its path in it, so each
    // of its files is listed at the path it had under the picked folder.
    function serve(root, dir) {
        stopShowing();
        const folder = {
            dir,
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
    // Files of the app's own, or fetched from web addresses, into a group. A file replaced under a tab
    // is a change on disk to it, told once: the watcher knows it by the new file's stamp, so its next
    // look does not tell it again.
    async function addToGroup(group, added) {
        const { paths, replaced } = await files.addToGroup(group, added);
        for (const path of replaced) {
            if (!watcher?.has(path))
                continue;
            watcher.watch(path, await files.stamp(path));
            onChanged?.(path);
        }
        return paths;
    }
    // The page's own fetch is looked up at each fetch, so one a page or a test puts in later is the one called.
    const fetchDeps = {
        fetch: options.fetch ?? ((url, init) => fetch(url, init)),
        online: () => nav.onLine !== false,
    };
    // Each web address's file by the URL fetched: its path once it is added, so an address asked for
    // again (in another spelling, or while its first fetch runs) is fetched once. One that failed is
    // let go, to be fetched afresh when it is asked for again.
    const fromUrl = new Map();
    // By each fetched file's path, the URL whose file is there and that address as it was first
    // given: what a link to it writes back. Two addresses of one name in one folder (`a.sldd?v=1`,
    // `?v=2`) share a path, as two files of a name in a group do, and take turns at it.
    const urlAt = new Map();
    const givenAt = new Map();
    // Fetch `fresh` (addresses not asked for before) together, then add the files fetched a group at a
    // time, each group's in one call and the groups in the order they first come, so the folders are
    // numbered as the addresses run: each address's path by its URL, or why it has none.
    async function addFetched(fresh) {
        const fetched = await Promise.allSettled(fresh.map((target) => fetchUrlBytes(target, fetchDeps)));
        const answers = new Map();
        const groups = new Map();
        fresh.forEach((target, i) => {
            const result = fetched[i];
            if (result.status === 'rejected')
                return void answers.set(target.url, asError(result.reason));
            let group = groups.get(target.group);
            if (!group)
                groups.set(target.group, (group = []));
            group.push({ target, bytes: result.value });
        });
        for (const [group, got] of groups) {
            const paths = await addToGroup(group, got.map(({ target, bytes }) => ({ name: target.name, source: { kind: 'bytes', bytes } })));
            got.forEach(({ target }, i) => {
                const path = paths[i];
                answers.set(target.url, path);
                // Another address's file was there: that address, asked for again, is fetched again.
                const before = urlAt.get(path);
                if (before !== undefined && before !== target.url)
                    fromUrl.delete(before);
                urlAt.set(path, target.url);
                givenAt.set(path, target.given);
            });
        }
        return answers;
    }
    async function fetchUrls(urls) {
        const origin = options.origin ?? location.origin;
        const targets = urls.map((given) => urlTargetOf(given, origin));
        const fresh = new Map();
        for (const target of targets) {
            if (!('problem' in target) && !fromUrl.has(target.url) && !fresh.has(target.url))
                fresh.set(target.url, target);
        }
        if (fresh.size) {
            const added = addFetched([...fresh.values()]);
            for (const url of fresh.keys()) {
                const path = added.then((answers) => {
                    const answer = answers.get(url);
                    if (answer instanceof Error)
                        throw answer;
                    return answer;
                });
                fromUrl.set(url, path);
                path.catch(() => {
                    if (fromUrl.get(url) === path)
                        fromUrl.delete(url);
                });
            }
        }
        // Each address's answer as this call found it, taken before a failure lets it go.
        const asked = targets.map((target) => ('problem' in target ? target : { target, path: fromUrl.get(target.url) }));
        const paths = [];
        const problems = [];
        for (const one of asked) {
            if ('problem' in one) {
                paths.push(null);
                problems.push(one.problem);
                continue;
            }
            try {
                paths.push(await one.path);
            }
            catch (err) {
                paths.push(null);
                problems.push(`${one.target.given} could not be fetched: ${asError(err).message}`);
            }
        }
        return { paths, problems };
    }
    return {
        // The registry's few members an app needs, and none of the rest.
        files: {
            addPicked: (name, source) => files.addPicked(name, source),
            addToGroup,
            get: (path) => files.get(path),
            has: (path) => files.has(path),
            urlOf: (path) => givenAt.get(path),
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
        fetchUrls,
        ...(options.openFromUrl && {
            async fetchUrl(url) {
                const { paths, problems } = await fetchUrls([url]);
                if (paths[0] === null)
                    throw new Error(problems[0]);
                return paths[0];
            },
        }),
        ...(onFolder && {
            async pickFolder() {
                const dir = await pickDirectory(deps);
                if (dir)
                    await openFolder(dir);
            },
            // The Folder view's moves: up to the folder picked and no further, and to a folder of a
            // folder picked this session. A folder outside them all is none of the page's.
            folderParent(path) {
                const of = pickedOf(path);
                return !of || path === of.root || !spelledIn(path, of.root) ? null : path.slice(0, path.lastIndexOf('/'));
            },
            async openFolderAt(path) {
                const of = pickedOf(path);
                if (!of || !spelledIn(path, of.root))
                    return false;
                const rel = path === of.root ? '' : path.slice(of.root.length + 1);
                await serve(path, await subDir(of.dir, rel)).looked;
                return true;
            },
            recentFolders: async () => picked.map((p) => p.root),
        }),
        // A folder the browser listed as it was picked is that list for good: ⟳ picks it again. A
        // handle's folder is read again.
        get folderRefresh() {
            return shown?.dir.kind === 'list' ? 'pick' : 'read';
        },
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
        // A file with no handle to write it through (a new file the page keeps, one picked as a File,
        // the app's own bytes) is downloaded.
        saveFile: (path, bytes) => writing(path, () => saveFile(files, path, bytes, doc), () => true),
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
        // The page's own links: it knows its address and how its files are named in one.
        ...(options.linkFor && { linkFor: options.linkFor }),
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
