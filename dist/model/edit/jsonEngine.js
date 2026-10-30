import { uriPathBasename } from '../ids/pathUtil.js';
import { parseDetached } from '../workspace/SlddModel.js';
import { describeSource } from './refusal.js';
import { EntryBaseline } from './slddBaseline.js';
import { JsonView } from './jsonView.js';
const freshState = () => ({
    views: 0,
    baseline: { captured: false, pending: false, version: -1, cleanAt: -1 },
    repaints: new Set(),
    diskStamp: null,
});
/** One open JSON dictionary: its text, the tables that show it, and what they share. */
export class JsonEngine {
    constructor(options) {
        this.closed = false;
        this.views = new Set();
        /** The Status column's baseline: the file on disk, entry by entry. */
        this.baseline = new EntryBaseline();
        /** While any table is open, what they share (forgotten with the last, as the extension forgets it). */
        this.docState = null;
        this.uri = options.uri;
        // The last segment of the uri's path, decoded, as `basename(uri.path)` names a VS Code uri.
        this.name = options.name ?? (uriPathBasename(options.uri) || 'document');
        const engine = this;
        this.document = {
            uri: this.uri,
            name: this.name,
            options,
            registry: options.registry,
            session: options.registry.session,
            text: options.text,
            baseline: this.baseline,
            views: this.views,
            // Core's messages name this source by its id (the uri), which every message shown here
            // spells as the file's name.
            describe: describeSource(this.uri, this.name),
            openView: () => {
                const state = (this.docState ??= freshState());
                state.views++;
                return state;
            },
            closeView: (state) => {
                // Defensive: an untracked table is treated as the last one, so a teardown is never skipped.
                if (this.docState !== state)
                    return true;
                if (--state.views > 0)
                    return false;
                // Forgotten, so the next table captures a fresh baseline rather than trusting a cleared one.
                this.docState = null;
                return true;
            },
            get state() {
                return engine.docState;
            },
        };
    }
    /** Whether `dispose()` has closed it. */
    get disposed() {
        return this.closed;
    }
    /**
     * The file on disk now holds `text`, which the document's text has moved on from (a save whose
     * bytes were read before the edits since): the Status column is measured from it, as from the
     * file's own bytes of a document opened with unsaved changes. The page's own: a TextDocument's
     * save writes the text as it stands.
     */
    fileHolds(text) {
        const state = this.docState;
        if (!state)
            return;
        let tree;
        try {
            tree = parseDetached(this.name, text);
        }
        catch {
            return;
        }
        this.baseline.capture(tree);
        state.baseline.captured = true;
        state.baseline.version = -1;
        for (const repaint of state.repaints)
            repaint();
    }
    /** A table of the document: an EditableTableSource, until its `dispose()`. */
    view() {
        if (this.closed)
            throw new Error(`${this.name} is closed.`);
        return new JsonView(this.document);
    }
    /** Close the document: every table closes, and the last releases the tree it held. */
    dispose() {
        if (this.closed)
            return;
        this.closed = true;
        for (const view of [...this.views])
            view.dispose();
    }
}
