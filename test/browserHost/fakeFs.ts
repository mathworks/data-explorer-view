// Copyright 2026 The MathWorks, Inc.
//
// An in-memory File System Access API, as far as the browser host uses it: directory and file
// handles with their entries, reads, writable streams and permission calls. A handle is an object
// over an entry on the fake disk, and two handle objects may share one (`again()`), as two picks of
// one file give, which isSameEntry tells. A file's lastModified moves on every write, as a disk's
// does, from a clock of its own. And what a drop holds: DataTransfer items with Chromium's handles,
// Firefox's and Safari's entries, or Files alone. Ported from data-explorer-app test/unit/web/fakeFs.ts.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ListedFile, WebDir } from '../../src/browser/walk.js';

let clock = 1_000;

const notFound = (name: string) => new DOMException(`A requested file or directory could not be found: ${name}`, 'NotFoundError');
const encode = (content: string | Uint8Array) => (typeof content === 'string' ? new TextEncoder().encode(content) : content);

/** A file on the fake disk: what every handle to it reads and writes. */
export interface FakeFileEntry {
  bytes: Uint8Array;
  lastModified: number;
  /** Gone from its directory, as a file deleted by another program is. */
  gone: boolean;
  /** Each write's bytes, in turn. */
  writes: Uint8Array[];
  /** Make the next write fail with this message. */
  failWrite?: string;
}

export class FakeFileHandle {
  readonly kind = 'file';
  readonly entry: FakeFileEntry;
  /** What queryPermission answers for `readwrite`, and what requestPermission sets it to. */
  writePermission: PermissionState = 'prompt';
  answer: PermissionState = 'granted';
  /** Make requestPermission reject with this, as Chromium's does when no click or key press led to it. */
  requestError?: DOMException;
  requests = 0;

  constructor(
    readonly name: string,
    content: string | Uint8Array | FakeFileEntry = '',
  ) {
    this.entry = content instanceof Uint8Array || typeof content === 'string'
      ? { bytes: encode(content), lastModified: ++clock, gone: false, writes: [] }
      : content;
  }

  get bytes() {
    return this.entry.bytes;
  }
  get lastModified() {
    return this.entry.lastModified;
  }
  get writes() {
    return this.entry.writes;
  }
  get gone() {
    return this.entry.gone;
  }
  set gone(gone: boolean) {
    this.entry.gone = gone;
  }
  set failWrite(message: string | undefined) {
    this.entry.failWrite = message;
  }

  /** Another handle object to the same file, as a second pick of it gives. */
  again(): FakeFileHandle {
    return new FakeFileHandle(this.name, this.entry);
  }

  async getFile(): Promise<File> {
    if (this.entry.gone) throw notFound(this.name);
    return new File([this.entry.bytes as Uint8Array<ArrayBuffer>], this.name, { lastModified: this.entry.lastModified });
  }

  /** Another program writes the file. */
  writeOutside(content: string): void {
    this.entry.bytes = encode(content);
    this.entry.lastModified = ++clock;
  }

  async createWritable() {
    const chunks: Uint8Array[] = [];
    let aborted = false;
    return {
      write: async (chunk: Uint8Array) => {
        if (this.entry.failWrite) throw new DOMException(this.entry.failWrite, 'InvalidStateError');
        chunks.push(chunk.slice());
      },
      close: async () => {
        if (aborted) throw new TypeError('aborted');
        const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
        let at = 0;
        for (const c of chunks) all.set(c, (at += c.length) - c.length);
        this.entry.bytes = all;
        this.entry.lastModified = ++clock;
        this.entry.writes.push(all);
      },
      abort: async () => {
        aborted = true;
      },
    };
  }

  async queryPermission({ mode }: { mode: 'read' | 'readwrite' }): Promise<PermissionState> {
    return mode === 'read' ? 'granted' : this.writePermission;
  }

  async requestPermission({ mode }: { mode: 'read' | 'readwrite' }): Promise<PermissionState> {
    this.requests++;
    if (this.requestError) throw this.requestError;
    if (mode === 'readwrite') this.writePermission = this.answer;
    return mode === 'read' ? 'granted' : this.writePermission;
  }

  async isSameEntry(other: unknown): Promise<boolean> {
    return other instanceof FakeFileHandle && other.entry === this.entry;
  }
}

/** A directory on the fake disk: what every handle to it lists. */
interface FakeDirEntry {
  children: Map<string, FakeFileHandle | FakeDirHandle>;
  /** Listing it fails, as a directory the user may not read does. */
  unreadable: boolean;
}

export class FakeDirHandle {
  readonly kind = 'directory';

  constructor(
    readonly name: string,
    readonly entry: FakeDirEntry = { children: new Map(), unreadable: false },
  ) {}

  get children() {
    return this.entry.children;
  }
  set unreadable(unreadable: boolean) {
    this.entry.unreadable = unreadable;
  }

  /** Another handle object to the same directory, as a second pick of it gives. */
  again(): FakeDirHandle {
    return new FakeDirHandle(this.name, this.entry);
  }

  async *values(): AsyncGenerator<FakeFileHandle | FakeDirHandle> {
    if (this.entry.unreadable) throw new DOMException('not allowed', 'NotAllowedError');
    yield* this.children.values();
  }

  async *entries(): AsyncGenerator<[string, FakeFileHandle | FakeDirHandle]> {
    for await (const child of this.values()) yield [child.name, child];
  }

  async getDirectoryHandle(name: string): Promise<FakeDirHandle> {
    const child = this.children.get(name);
    if (child?.kind !== 'directory') throw notFound(name);
    return child;
  }

  async getFileHandle(name: string): Promise<FakeFileHandle> {
    const child = this.children.get(name);
    if (child?.kind !== 'file' || child.gone) throw notFound(name);
    return child;
  }

  async isSameEntry(other: unknown): Promise<boolean> {
    return other instanceof FakeDirHandle && other.entry === this.entry;
  }

  /** The file at the `/`-separated `rel` under this directory, made with the directories above it. */
  add(rel: string, content: string | Uint8Array = ''): FakeFileHandle {
    const cut = rel.lastIndexOf('/');
    const name = rel.slice(cut + 1);
    const dir = cut < 0 ? this : this.dir(rel.slice(0, cut));
    const file = new FakeFileHandle(name, content);
    dir.children.set(name, file);
    return file;
  }

  /** Take the file at `rel` out of its directory, as another program deleting it does. */
  remove(rel: string): void {
    const cut = rel.lastIndexOf('/');
    const dir = cut < 0 ? this : this.dir(rel.slice(0, cut));
    const file = dir.children.get(rel.slice(cut + 1));
    if (file?.kind === 'file') file.gone = true;
    dir.children.delete(rel.slice(cut + 1));
  }

  /** The file at `rel`. */
  file(rel: string): FakeFileHandle {
    const cut = rel.lastIndexOf('/');
    const file = (cut < 0 ? this : this.dir(rel.slice(0, cut))).children.get(rel.slice(cut + 1));
    if (file?.kind !== 'file') throw new Error(`no file ${rel}`);
    return file;
  }

  /** The directory at `rel`, made if need be. */
  dir(rel: string): FakeDirHandle {
    let dir: FakeDirHandle = this;
    for (const part of rel.split('/')) {
      const next = dir.children.get(part);
      dir = next?.kind === 'directory' ? next : dir.children.set(part, new FakeDirHandle(part)).get(part)! as FakeDirHandle;
    }
    return dir;
  }
}

/** A directory named `name` holding `files`, by their paths in it. */
export function fakeDir(name: string, files: Record<string, string | Uint8Array> = {}): FakeDirHandle {
  const dir = new FakeDirHandle(name);
  for (const [rel, content] of Object.entries(files)) dir.add(rel, content);
  return dir;
}

/** A fake as the DOM type the host takes. */
export const asFile = (h: FakeFileHandle) => h as unknown as FileSystemFileHandle;
export const asDir = (h: FakeDirHandle) => h as unknown as FileSystemDirectoryHandle;

/** A File named `name`, as a picked or dropped one is, holding `content`. */
export function fileOf(name: string, content: string | Uint8Array = '', lastModified = 5_000): File {
  return new File([encode(content) as Uint8Array<ArrayBuffer>], name, { lastModified });
}

/** `file`, read after the file it refers to changed on disk: every read fails, as the browser's does. */
export function changedSincePicked(file: File): File {
  const fail = () => Promise.reject(new DOMException('The requested file could not be read.', 'NotReadableError'));
  Object.defineProperty(file, 'arrayBuffer', { value: fail });
  Object.defineProperty(file, 'text', { value: fail });
  return file;
}

/** The File list an `<input webkitdirectory>` gives for a folder named `root` holding `files`. */
export function inputFilesOf(root: string, files: Record<string, string | Uint8Array>): File[] {
  return Object.entries(files).map(([rel, content]) => {
    const file = fileOf(rel.slice(rel.lastIndexOf('/') + 1), content);
    Object.defineProperty(file, 'webkitRelativePath', { value: `${root}/${rel}` });
    return file;
  });
}

/** A folder named `root` as the browser listed it when it was picked, holding `files`. */
export function listedDir(root: string, files: Record<string, string | Uint8Array>): WebDir {
  const listed: ListedFile[] = Object.entries(files).map(([rel, content]) => ({ rel, file: fileOf(rel.slice(rel.lastIndexOf('/') + 1), content) }));
  return { kind: 'list', root, files: listed };
}

/** Firefox's and Safari's entry for a dropped file or folder (FileSystemEntry), over `files` for a folder. */
export class FakeEntry {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly children: FakeEntry[] = [];
  /** Reading this directory fails, as one the user may not read does. */
  unreadable = false;

  constructor(
    readonly name: string,
    readonly content?: string,
  ) {
    this.isFile = content !== undefined;
    this.isDirectory = !this.isFile;
  }

  file(resolve: (file: File) => void): void {
    resolve(fileOf(this.name, this.content ?? ''));
  }

  /** A reader that answers two entries a batch, then an empty batch, as Chromium's answers 100. */
  createReader() {
    let at = 0;
    return {
      readEntries: (resolve: (entries: FakeEntry[]) => void, reject: (err: DOMException) => void) => {
        if (this.unreadable) return reject(new DOMException('not allowed', 'NotReadableError'));
        const batch = this.children.slice(at, at + 2);
        at += batch.length;
        queueMicrotask(() => resolve(batch));
      },
    };
  }
}

/** A folder entry named `name` holding `files`, by their paths in it. */
export function entryOf(name: string, files: Record<string, string>): FakeEntry {
  const root = new FakeEntry(name);
  for (const [rel, content] of Object.entries(files)) {
    let dir = root;
    const parts = rel.split('/');
    for (const part of parts.slice(0, -1)) {
      let next = dir.children.find((c) => c.name === part && c.isDirectory);
      if (!next) dir.children.push((next = new FakeEntry(part)));
      dir = next;
    }
    dir.children.push(new FakeEntry(parts.at(-1)!, content));
  }
  return root;
}

/** What one dropped item hands out: a Chromium handle, an entry, a File, or any of them. */
export interface FakeItem {
  handle?: FakeFileHandle | FakeDirHandle | null;
  entry?: FakeEntry | null;
  file?: File | null;
}

/**
 * A DataTransfer of `items`, as a drop's: each item answers only while `live` says the drop is
 * still being handled, as a browser's drag data store does, and throws after.
 */
export function dataTransferOf(items: FakeItem[], options: { files?: File[]; handles?: boolean; entries?: boolean } = {}) {
  const state = { live: true };
  const check = () => {
    if (!state.live) throw new DOMException('The drag data store is protected.', 'InvalidStateError');
  };
  const dtItems = items.map((item) => ({
    kind: 'file',
    type: '',
    ...(options.handles !== false && {
      getAsFileSystemHandle: () => (check(), Promise.resolve(item.handle ?? null)),
    }),
    ...(options.entries !== false && { webkitGetAsEntry: () => (check(), item.entry ?? null) }),
    getAsFile: () => (check(), item.file ?? null),
  }));
  const data = { items: dtItems, files: options.files ?? items.map((i) => i.file).filter((f): f is File => !!f), types: ['Files'] };
  return { data: data as unknown as DataTransfer, state };
}

/** An AbortError, a picker's answer to the user cancelling it. */
export const aborted = () => new DOMException('The user aborted a request.', 'AbortError');

/** Every file under the directory `dir` on disk, by its `/`-separated path in it: for a fake of a fixture folder. */
export function filesOnDisk(dir: string): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    out[path.relative(dir, full).split(path.sep).join('/')] = new Uint8Array(readFileSync(full));
  }
  return out;
}
