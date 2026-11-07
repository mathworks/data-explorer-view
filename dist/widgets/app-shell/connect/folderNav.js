// Copyright 2026 The MathWorks, Inc.
//
// The Folder view's moves and menus: the path bar's segments, ↑ and ⟳, the folders a long path
// folded away, Folder Actions (⋯), and each row's menu. connectShell says what the shell does with
// a file (open it, beside the others or not, close it); this keeps the folder's own half.
//
// A MOVE IS THE HOST'S. ↑, a segment, a recent folder and a folder row's Use as Folder each ask the
// host to make another folder the workspace folder (ShellHost.openFolderAt): it serves that one,
// and the shell hears it as it hears Open Folder, by ShellHandle.showFolder. Until then the bar is
// busy and a line says what is read; a host that cannot open it leaves the folder shown as it was,
// and the shell says why. Where the host has no folder above (a browser's picked folder, `/`),
// there is no ↑, and a host whose folder is a snapshot it cannot read again (a browser's file
// input) picks it again on ⟳.
//
// The menus are the shared context menu, which the tables and the Explorer's files use too: each is
// acted on by its next choice only, and a dismissal, or the menu shown again by another part, ends
// it (fileMenu.ts does the same for the Explorer's files).
import { basename } from '../../../model/ids/pathUtil.js';
import { rowPath } from '../../../model/hierarchy/folderTree.js';
import { copyText } from './documents.js';
import { onMac } from './keys.js';
const message = (err) => (err instanceof Error ? err.message : String(err));
/** The most folders a path is walked up from the folder shown: a host whose parents never end is cut short. */
const MAX_UP = 64;
/** The most recent folders ⋯ lists. */
const MAX_RECENT = 8;
/**
 * What a folder's segment reads: its name, a trailing separator or not (`/work/plant/` is `plant`);
 * the top of a path by itself (`/`, and a drive as `C:`).
 */
export function folderLabel(path) {
    if (/^[\\/]+$/.test(path))
        return '/';
    const drive = /^([A-Za-z]:)[\\/]*$/.exec(path);
    if (drive)
        return drive[1];
    const trimmed = path.replace(/[\\/]+$/, '');
    return basename(trimmed) || trimmed;
}
/**
 * The path bar's segments for the folder `root`, outermost first: `root` and each folder the host
 * gives above it (`parent`), up to the one it gives none for, or at most MAX_UP folders up. A host
 * with no `parent` has the folder alone; one that answers the folder itself has gone as far as it
 * goes.
 */
export function segmentsOf(root, parent) {
    const chain = [root];
    for (let at = root; chain.length <= MAX_UP;) {
        const up = parent?.(at);
        if (up == null || up === at)
            break;
        chain.unshift(up);
        at = up;
    }
    return chain.map((path) => ({ label: folderLabel(path), path }));
}
/** What a file manager is called, in a menu's Reveal: the host's word, else the platform's (as a project page says it). */
const revealInOf = (host) => host.revealIn ?? (onMac() ? 'Finder' : 'the file manager');
const separator = () => ({ item: { id: '', label: '', separator: true } });
/** Wire the Folder view's bar and menus over `context`. */
export function connectFolderNav(context) {
    const { host, part, bar, menu } = context;
    let disposed = false;
    // The move asked for last: an earlier one answering after it says nothing of the folder shown.
    let moving = 0;
    // The items of the menu this module showed last, by id, until it is chosen from or dismissed.
    let acts = null;
    const parent = () => (host.folderParent ? (path) => host.folderParent(path) : undefined);
    // A folder above the one shown, and a host that can open it: a parent that is the folder itself
    // (a Windows drive's `C:\`) is none.
    const canUp = () => {
        const root = context.folder()?.root;
        if (root === undefined)
            return false;
        const up = host.folderParent?.(root);
        return !!up && up !== root && !!host.openFolderAt;
    };
    const refreshKind = () => (host.folderRefresh === 'pick' ? 'pick' : 'read');
    // Busy while a move or a read is under way, a line saying which folder, put in a task after the
    // bar goes busy (as a tab's "Opening…" note is), so a screen reader says it.
    const busy = (path) => {
        const ask = ++moving;
        bar.busy = true;
        part.status = '';
        setTimeout(() => {
            if (!disposed && ask === moving && bar.busy)
                part.status = `Reading ${folderLabel(path)}…`;
        }, 0);
        return ask;
    };
    const idle = () => {
        bar.busy = false;
        part.status = '';
    };
    async function goTo(path) {
        if (!host.openFolderAt || path === context.folder()?.root)
            return;
        const name = folderLabel(path);
        const ask = busy(path);
        let opened = false;
        let why;
        try {
            opened = await host.openFolderAt(path);
        }
        catch (err) {
            why = message(err);
        }
        // Shown (or overtaken by a later move) meanwhile: nothing more to say here.
        if (disposed || ask !== moving)
            return;
        if (opened)
            return;
        idle();
        context.failed(why === undefined ? `Could not open ${name}.` : `Could not open ${name}: ${why}`);
    }
    const pickAgain = () => {
        void host.pickFolder?.().catch((err) => {
            // One the user cancelled is an answer, and says nothing (carryOut's rule for Open Folder).
            if (!(err instanceof Error && err.name === 'AbortError'))
                context.failed(`Could not open a folder: ${message(err)}`);
        });
    };
    function refresh() {
        if (refreshKind() === 'pick')
            return pickAgain();
        const folder = context.folder();
        if (!folder || bar.busy)
            return;
        const ask = busy(folder.root);
        folder
            .readAgain()
            .catch((err) => context.failed(`Could not read ${folderLabel(folder.root)} again: ${message(err)}`))
            .finally(() => {
            if (!disposed && ask === moving)
                idle();
        });
    }
    function up() {
        const root = context.folder()?.root;
        const above = root === undefined ? null : host.folderParent?.(root);
        if (above && above !== root)
            void goTo(above);
    }
    function show(x, y, entries, keyboard = false) {
        if (entries.length === 0)
            return;
        menu.show(x, y, entries.map((e) => e.item), keyboard ? { focusFirst: true } : {});
        // After show(): a menu it replaced said it closed, which ends that menu before this one.
        acts = new Map(entries.flatMap((e) => (e.act ? [[e.item.id, e.act]] : [])));
    }
    // Reveal and Copy Path, for a row's file or folder, or the folder shown.
    const where = (path, name) => [
        ...(host.reveal
            ? [
                {
                    item: { id: 'folder-reveal', label: `Reveal in ${revealInOf(host)}` },
                    act: () => void host.reveal?.(path).catch((err) => context.failed(`Could not reveal ${name}: ${message(err)}`)),
                },
            ]
            : []),
        {
            item: { id: 'folder-copy-path', label: 'Copy Path', icon: 'copy' },
            act: () => void copyText(host, path).then(() => context.said(`Copied the path of ${name}`), (err) => context.failed(`Could not copy the path of ${name}: ${message(err)}`)),
        },
    ];
    // ⋯: Open Folder…, the folders opened before (the one shown is not among them), and Reveal.
    async function actionsMenu(anchor, keyboard) {
        const root = context.folder()?.root;
        const recent = host.recentFolders && host.openFolderAt ? await host.recentFolders().catch(() => []) : [];
        if (disposed)
            return;
        const others = recent.filter((p) => p !== root).slice(0, MAX_RECENT);
        // Two folders of one name are told apart by their paths.
        const names = others.map(folderLabel);
        const entries = [
            ...(host.pickFolder ? [{ item: { id: 'folder-open', label: 'Open Folder…', icon: 'openFolder' }, act: pickAgain }] : []),
            ...others.map((p, i) => ({
                item: { id: `folder-recent-${i}`, label: names.indexOf(names[i]) === names.lastIndexOf(names[i]) ? names[i] : p, icon: 'folder' },
                act: () => void goTo(p),
            })),
        ];
        if (root !== undefined && host.reveal) {
            const reveal = where(root, folderLabel(root)).filter((e) => e.item.id === 'folder-reveal');
            if (entries.length > 0)
                entries.push(separator());
            entries.push(...reveal);
        }
        show(anchor.x, anchor.y + anchor.height, entries, keyboard);
    }
    // `…`: the folders a long path folded away, each a move there.
    function foldMenu(anchor, segments, keyboard) {
        show(anchor.x, anchor.y + anchor.height, segments.map((s, i) => ({ item: { id: `folder-fold-${i}`, label: s.label, icon: 'folder' }, act: () => void goTo(s.path) })), keyboard);
    }
    // A row's menu: a data file opens, beside the others or not, and closes; a folder becomes the
    // workspace folder; and any row of a file or a folder reveals it and copies its path. A row of
    // neither (External Data, an unresolved reference, a notice) has none.
    function rowMenu({ item, x, y, keyboard }) {
        const path = rowPath(item);
        if (path === undefined)
            return;
        const name = item.label;
        const head = [];
        if (isDataRow(item)) {
            const uri = item.id;
            head.push({ item: { id: 'folder-row-open', label: 'Open' }, act: () => context.open(path, false) }, { item: { id: 'folder-row-side', label: 'Open to the Side' }, act: () => context.open(path, true) });
            if (context.isOpen(uri))
                head.push({ item: { id: 'folder-row-close', label: 'Close', icon: 'close' }, act: () => context.close(uri) });
        }
        else if (isFolderRow(item) && host.openFolderAt && path !== context.folder()?.root) {
            // The root's row is the workspace folder already.
            head.push({ item: { id: 'folder-row-root', label: 'Use as Folder', icon: 'folder' }, act: () => void goTo(path) });
        }
        const tail = where(path, name);
        show(x, y, head.length > 0 ? [...head, separator(), ...tail] : tail, keyboard === true);
    }
    const onUp = () => up();
    const onGo = (e) => void goTo(e.detail.path);
    const onRefresh = () => refresh();
    // Each menu a key opened (Enter or Space on ⋯ or …) takes the keyboard, as a menu button's does.
    const onMenu = (e) => {
        const { anchor, segments } = e.detail;
        const keyboard = e.detail.keyboard === true;
        if (segments)
            foldMenu(anchor, segments, keyboard);
        else
            void actionsMenu(anchor, keyboard);
    };
    const onAction = (e) => {
        const act = acts?.get(e.detail.actionId);
        acts = null;
        act?.();
    };
    const onClosed = () => {
        acts = null;
    };
    bar.addEventListener('dex-folder-up', onUp);
    bar.addEventListener('dex-folder-go', onGo);
    bar.addEventListener('dex-folder-refresh', onRefresh);
    bar.addEventListener('dex-folder-menu', onMenu);
    menu.addEventListener('dex-action', onAction);
    menu.addEventListener('dex-menu-closed', onClosed);
    return {
        shown(root) {
            bar.segments = segmentsOf(root, parent());
            bar.canUp = canUp();
            bar.refresh = refreshKind();
            // The move asked for has come, whichever it was: none is under way now.
            moving++;
            idle();
        },
        up,
        refresh,
        commands: () => ({ shown: !!context.folder(), canUp: canUp(), refresh: refreshKind() }),
        rowMenu,
        dispose() {
            if (disposed)
                return;
            disposed = true;
            bar.removeEventListener('dex-folder-up', onUp);
            bar.removeEventListener('dex-folder-go', onGo);
            bar.removeEventListener('dex-folder-refresh', onRefresh);
            bar.removeEventListener('dex-folder-menu', onMenu);
            menu.removeEventListener('dex-action', onAction);
            menu.removeEventListener('dex-menu-closed', onClosed);
        },
    };
}
/** A row of a file the app opens: a data file's, its own or a reference's. */
function isDataRow(item) {
    return !item.dimmed && item.id !== undefined && (item.kind === 'model' || item.kind === 'sldd' || item.kind === 'mat' || item.kind === 'project');
}
/** A folder's row of a FolderTree's (a project's folder among them): a folder that can be made the workspace folder. */
function isFolderRow(item) {
    return item.kind === 'group' && (item.groupKind === 'folder' || item.groupKind === 'project') && item.path !== undefined;
}
