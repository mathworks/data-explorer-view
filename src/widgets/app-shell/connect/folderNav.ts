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
import type { ContextMenuItem, DexContextMenu } from '../../context-menu/dex-context-menu.js';
import type { HierarchyItem, HierarchyMenuDetail } from '../../hierarchy/dex-hierarchy.js';
import type { DexFolderBar, FolderMenuDetail, FolderSegment } from '../dex-folder-bar.js';
import type { DexShellFolder } from './dex-shell-folder.js';
import { copyText } from './documents.js';
import type { FolderView } from './folder.js';
import { onMac } from './keys.js';
import type { FolderCommands } from './paletteItems.js';
import type { ShellHost } from './types.js';

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The most folders a path is walked up from the folder shown: a host whose parents never end is cut short. */
const MAX_UP = 64;
/** The most recent folders ⋯ lists. */
const MAX_RECENT = 8;

/**
 * What a folder's segment reads: its name, a trailing separator or not (`/work/plant/` is `plant`);
 * the top of a path by itself (`/`, and a drive as `C:`).
 */
export function folderLabel(path: string): string {
  if (/^[\\/]+$/.test(path)) return '/';
  const drive = /^([A-Za-z]:)[\\/]*$/.exec(path);
  if (drive) return drive[1]!;
  const trimmed = path.replace(/[\\/]+$/, '');
  return basename(trimmed) || trimmed;
}

/**
 * The path bar's segments for the folder `root`, outermost first: `root` and each folder the host
 * gives above it (`parent`), up to the one it gives none for, or at most MAX_UP folders up. A host
 * with no `parent` has the folder alone; one that answers the folder itself has gone as far as it
 * goes.
 */
export function segmentsOf(root: string, parent: ((path: string) => string | null) | undefined): FolderSegment[] {
  const chain = [root];
  for (let at = root; chain.length <= MAX_UP; ) {
    const up = parent?.(at);
    if (up == null || up === at) break;
    chain.unshift(up);
    at = up;
  }
  return chain.map((path) => ({ label: folderLabel(path), path }));
}

/** What a file manager is called, in a menu's Reveal: the host's word, else the platform's (as a project page says it). */
const revealInOf = (host: ShellHost): string => host.revealIn ?? (onMac() ? 'Finder' : 'the file manager');

/** What the Folder view's moves and menus are carried out with. */
export interface FolderNavContext {
  host: ShellHost;
  /** The Folder view's part: its line that says what is read. */
  part: DexShellFolder;
  bar: DexFolderBar;
  /** The shared context menu. */
  menu: DexContextMenu;
  /** The folder shown now, if any. */
  folder(): FolderView | undefined;
  /** Whether a tab has the file of `uri` open. */
  isOpen(uri: string): boolean;
  /** Open the file at `path` in a tab kept (no preview), and with `side`, in the pane on the right. */
  open(path: string, side: boolean): void;
  /** Close the tab of the file `uri`, asking first about unsaved edits. */
  close(uri: string): void;
  /** The rows taken into the tree's selection (its `selectedItems`), in the tree's order. */
  selected(): readonly HierarchyItem[];
  /** Open the file at `path` in a tab kept, and ask which file to compare it with (Compare With…). */
  compareWith(path: string): void;
  /** Open the files at `first` and `second` in tabs kept, and compare the first with the second. */
  compare(first: string, second: string): void;
  /** Say something briefly (a toast and the Log). */
  said(text: string): void;
  /** Something could not be done: say so. */
  failed(text: string): void;
}

/** The Folder view's moves, as connectShell drives them. */
export interface FolderNav {
  /** The folder `root` is shown now: the bar's segments, ↑ and ⟳ drawn for it, and a move under way over. */
  shown(root: string): void;
  /** Make the folder above the one shown the workspace folder (↑, the palette's Up One Level). */
  up(): void;
  /** Read the folder shown again (⟳, Read Again), or pick it again for a host whose folder is a snapshot. */
  refresh(): void;
  /** What the palette's folder rows can do now (all but whether there is a Folder view, which is connectShell's to say). */
  commands(): Omit<FolderCommands, 'view'>;
  /** Show the menu of a row the tree asked one for. */
  rowMenu(detail: HierarchyMenuDetail): void;
  dispose(): void;
}

/** One item of a menu, and what choosing it does (none for a separator). */
type Entry = { item: ContextMenuItem; act?: () => void };
const separator = (): Entry => ({ item: { id: '', label: '', separator: true } });

/** Wire the Folder view's bar and menus over `context`. */
export function connectFolderNav(context: FolderNavContext): FolderNav {
  const { host, part, bar, menu } = context;
  let disposed = false;
  // The move asked for last: an earlier one answering after it says nothing of the folder shown.
  let moving = 0;
  // The items of the menu this module showed last, by id, until it is chosen from or dismissed.
  let acts: Map<string, () => void> | null = null;

  const parent = (): ((path: string) => string | null) | undefined => (host.folderParent ? (path) => host.folderParent!(path) : undefined);
  // A folder above the one shown, and a host that can open it: a parent that is the folder itself
  // (a Windows drive's `C:\`) is none.
  const canUp = (): boolean => {
    const root = context.folder()?.root;
    if (root === undefined) return false;
    const up = host.folderParent?.(root);
    return !!up && up !== root && !!host.openFolderAt;
  };
  const refreshKind = (): 'read' | 'pick' => (host.folderRefresh === 'pick' ? 'pick' : 'read');

  // Busy while a move or a read is under way, a line saying which folder, put in a task after the
  // bar goes busy (as a tab's "Opening…" note is), so a screen reader says it.
  const busy = (path: string): number => {
    const ask = ++moving;
    bar.busy = true;
    part.status = '';
    setTimeout(() => {
      if (!disposed && ask === moving && bar.busy) part.status = `Reading ${folderLabel(path)}…`;
    }, 0);
    return ask;
  };
  const idle = (): void => {
    bar.busy = false;
    part.status = '';
  };

  async function goTo(path: string): Promise<void> {
    if (!host.openFolderAt || path === context.folder()?.root) return;
    const name = folderLabel(path);
    const ask = busy(path);
    let opened = false;
    let why: string | undefined;
    try {
      opened = await host.openFolderAt(path);
    } catch (err) {
      why = message(err);
    }
    // Shown (or overtaken by a later move) meanwhile: nothing more to say here.
    if (disposed || ask !== moving) return;
    if (opened) return;
    idle();
    context.failed(why === undefined ? `Could not open ${name}.` : `Could not open ${name}: ${why}`);
  }

  const pickAgain = (): void => {
    void host.pickFolder?.().catch((err: unknown) => {
      // One the user cancelled is an answer, and says nothing (carryOut's rule for Open Folder).
      if (!(err instanceof Error && err.name === 'AbortError')) context.failed(`Could not open a folder: ${message(err)}`);
    });
  };

  function refresh(): void {
    if (refreshKind() === 'pick') return pickAgain();
    const folder = context.folder();
    if (!folder || bar.busy) return;
    const ask = busy(folder.root);
    folder
      .readAgain()
      .catch((err: unknown) => context.failed(`Could not read ${folderLabel(folder.root)} again: ${message(err)}`))
      .finally(() => {
        if (!disposed && ask === moving) idle();
      });
  }

  function up(): void {
    const root = context.folder()?.root;
    const above = root === undefined ? null : host.folderParent?.(root);
    if (above && above !== root) void goTo(above);
  }

  function show(x: number, y: number, entries: Entry[], keyboard = false): void {
    if (entries.length === 0) return;
    menu.show(
      x,
      y,
      entries.map((e) => e.item),
      keyboard ? { focusFirst: true } : {},
    );
    // After show(): a menu it replaced said it closed, which ends that menu before this one.
    acts = new Map(entries.flatMap((e) => (e.act ? [[e.item.id, e.act] as const] : [])));
  }

  // Reveal and Copy Path, for a row's file or folder, or the folder shown.
  const where = (path: string, name: string): Entry[] => [
    ...(host.reveal
      ? [
          {
            item: { id: 'folder-reveal', label: `Reveal in ${revealInOf(host)}` },
            act: () => void host.reveal?.(path).catch((err: unknown) => context.failed(`Could not reveal ${name}: ${message(err)}`)),
          },
        ]
      : []),
    {
      item: { id: 'folder-copy-path', label: 'Copy Path', icon: 'copy' },
      act: () =>
        void copyText(host, path).then(
          () => context.said(`Copied the path of ${name}`),
          (err: unknown) => context.failed(`Could not copy the path of ${name}: ${message(err)}`),
        ),
    },
  ];

  // ⋯: Open Folder…, the folders opened before (the one shown is not among them), and Reveal.
  async function actionsMenu(anchor: FolderMenuDetail['anchor'], keyboard: boolean): Promise<void> {
    const root = context.folder()?.root;
    const recent = host.recentFolders && host.openFolderAt ? await host.recentFolders().catch(() => [] as readonly string[]) : [];
    if (disposed) return;
    const others = recent.filter((p) => p !== root).slice(0, MAX_RECENT);
    // Two folders of one name are told apart by their paths.
    const names = others.map(folderLabel);
    const entries: Entry[] = [
      ...(host.pickFolder ? [{ item: { id: 'folder-open', label: 'Open Folder…', icon: 'openFolder' }, act: pickAgain }] : []),
      ...others.map((p, i) => ({
        item: { id: `folder-recent-${i}`, label: names.indexOf(names[i]!) === names.lastIndexOf(names[i]!) ? names[i]! : p, icon: 'folder' },
        act: () => void goTo(p),
      })),
    ];
    if (root !== undefined && host.reveal) {
      const reveal = where(root, folderLabel(root)).filter((e) => e.item.id === 'folder-reveal');
      if (entries.length > 0) entries.push(separator());
      entries.push(...reveal);
    }
    show(anchor.x, anchor.y + anchor.height, entries, keyboard);
  }

  // `…`: the folders a long path folded away, each a move there.
  function foldMenu(anchor: FolderMenuDetail['anchor'], segments: readonly FolderSegment[], keyboard: boolean): void {
    show(
      anchor.x,
      anchor.y + anchor.height,
      segments.map((s, i) => ({ item: { id: `folder-fold-${i}`, label: s.label, icon: 'folder' }, act: () => void goTo(s.path) })),
      keyboard,
    );
  }

  // A row's menu: a data file opens, beside the others or not, is compared with another (and with
  // the one other data file taken into the selection with it, first), and closes; a folder becomes
  // the workspace folder; and any row of a file or a folder reveals it and copies its path. A row of
  // neither (External Data, an unresolved reference, a notice) has none.
  function rowMenu({ item, x, y, keyboard }: HierarchyMenuDetail): void {
    const path = rowPath(item);
    if (path === undefined) return;
    const name = item.label;
    const head: Entry[] = [];
    if (isDataRow(item)) {
      const uri = item.id!;
      // Two data files' rows selected, this one among them: the two compared, in the tree's order.
      const pair = context.selected();
      if (pair.length === 2 && pair.every(isComparedRow) && pair.some((p) => p.key === item.key)) {
        const [first, second] = pair.map((p) => rowPath(p));
        if (first !== undefined && second !== undefined) {
          head.push({ item: { id: 'folder-row-compare-selected', label: 'Compare Selected', icon: 'compareUI' }, act: () => context.compare(first, second) });
        }
      }
      head.push(
        { item: { id: 'folder-row-open', label: 'Open' }, act: () => context.open(path, false) },
        { item: { id: 'folder-row-side', label: 'Open to the Side' }, act: () => context.open(path, true) },
      );
      if (isComparedRow(item)) head.push({ item: { id: 'folder-row-compare', label: 'Compare With…', icon: 'compareUI' }, act: () => context.compareWith(path) });
      if (context.isOpen(uri)) head.push({ item: { id: 'folder-row-close', label: 'Close', icon: 'close' }, act: () => context.close(uri) });
    } else if (isFolderRow(item) && host.openFolderAt && path !== context.folder()?.root) {
      // The root's row is the workspace folder already.
      head.push({ item: { id: 'folder-row-root', label: 'Use as Folder', icon: 'folder' }, act: () => void goTo(path) });
    }
    const tail = where(path, name);
    show(x, y, head.length > 0 ? [...head, separator(), ...tail] : tail, keyboard === true);
  }

  const onUp = (): void => up();
  const onGo = (e: CustomEvent<{ path: string }>): void => void goTo(e.detail.path);
  const onRefresh = (): void => refresh();
  // Each menu a key opened (Enter or Space on ⋯ or …) takes the keyboard, as a menu button's does.
  const onMenu = (e: CustomEvent<FolderMenuDetail>): void => {
    const { anchor, segments } = e.detail;
    const keyboard = e.detail.keyboard === true;
    if (segments) foldMenu(anchor, segments, keyboard);
    else void actionsMenu(anchor, keyboard);
  };
  const onAction = (e: CustomEvent<{ actionId: string }>): void => {
    const act = acts?.get(e.detail.actionId);
    acts = null;
    act?.();
  };
  const onClosed = (): void => {
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
      if (disposed) return;
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
function isDataRow(item: HierarchyItem): boolean {
  return !item.dimmed && item.id !== undefined && (item.kind === 'model' || item.kind === 'sldd' || item.kind === 'mat' || item.kind === 'project');
}

/** A data file's row a compare reads: a file the app opens, but a project, which opens on a page and has no table. */
function isComparedRow(item: HierarchyItem): boolean {
  return isDataRow(item) && item.kind !== 'project';
}

/** A folder's row of a FolderTree's (a project's folder among them): a folder that can be made the workspace folder. */
function isFolderRow(item: HierarchyItem): boolean {
  return item.kind === 'group' && (item.groupKind === 'folder' || item.groupKind === 'project') && item.path !== undefined;
}
