// Copyright 2026 The MathWorks, Inc.
//
// The folder in the Explorer: read across the port the host serves it on (serveFolder there,
// folderReader here), as one folder session: its hierarchy, its Usage, its names.
//
// Lifted from data-explorer-app src/renderer/folder.ts at 0983920. The empty note may be a
// function, as connectHierarchy takes one, since the shell's note is a property of its folder
// element rather than an element of the page.
import { isGraphPath } from 'data-explorer-core';
import { createFolderSession } from '../../../model/folder/folderSession.js';
import { folderReader } from '../../../model/source/folderReader.js';
import { portFromMessagePort } from '../../../model/source/ports.js';
import { sourceUri, uriPath } from '../../../model/source/sourceUri.js';
import { connectHierarchy } from '../../hierarchy/connectHierarchy.js';
/** Show the folder `root`, read across `port`, in `tree`; a chosen file's uri goes to `open`. */
export function showFolder(tree, root, port, options) {
    const reader = folderReader(portFromMessagePort(port));
    const session = createFolderSession({ files: reader, reader: () => reader, watch: (changed) => reader.onChange(changed) });
    const handle = connectHierarchy(tree, session.hierarchy, { empty: options.empty, expandTopLevel: true });
    // The graph's files as last read, by uri, with the version they were read at.
    const read = new Map();
    const readNow = async (file) => {
        const version = await reader.version(file);
        const kept = read.get(file.uriString);
        if (kept && version !== null && kept.version === version)
            return kept.bytes;
        const bytes = await reader.bytes(file);
        if (bytes && version !== null)
            read.set(file.uriString, { version, bytes });
        else
            read.delete(file.uriString);
        return bytes;
    };
    handle.on('open', options.open);
    handle.on('error', options.error);
    return {
        root,
        session,
        lists: (uri) => session.has(uri),
        resolveLink: async (link, fromUri) => session.hierarchy.resolveLink(link, fromUri),
        reveal: (uri) => void handle.reveal(uri),
        // The host answers a store only for a file it listed.
        async projectStore(uri) {
            await session.listed();
            return reader.projectStore({ uriString: uri, path: uriPath(uri) });
        },
        projectIn: async (dir) => (await session.projectIn(sourceUri(dir)))?.id,
        // Listed again, as the host answers bytes only for a file of its last listing; a file listed
        // no more is let go.
        async graphSources() {
            const files = (await reader.list()).filter((f) => isGraphPath(f.path));
            const listed = new Set(files.map((f) => f.uriString));
            for (const uri of [...read.keys()])
                if (!listed.has(uri))
                    read.delete(uri);
            const answers = await Promise.all(files.map(async (f) => ({ f, bytes: await readNow(f) })));
            return answers.flatMap(({ f, bytes }) => (bytes ? [{ uriString: f.uriString, path: f.path, bytes }] : []));
        },
        onChange: (listener) => reader.onChange(listener),
        dispose() {
            handle.dispose();
            session.dispose();
            reader.dispose();
            port.close();
        },
    };
}
