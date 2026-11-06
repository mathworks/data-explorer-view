// Copyright 2026 The MathWorks, Inc.
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { defineElement } from '../shared/define.js';
import { defineIcon } from '../shared/dex-icon.js';
import { dragModeFromModifiers } from '../shared/dragMode.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { styleProps } from '../shared/styleProps.js';
// What a drag of a table's rows carries (the tree table's dragstart sets it): a drag of anything
// else, files from the OS among them, is not one this list takes.
const ROWS_TYPE = 'application/dex-rows';
const carriesRows = (e) => Array.from(e.dataTransfer?.types ?? []).includes(ROWS_TYPE);
// The headings, in the order they are drawn, as the prototype's Workspace tree lists them.
const GROUPS = [
    { group: 'model', heading: 'Simulink Models' },
    { group: 'sldd', heading: 'Data Dictionaries' },
    { group: 'mat', heading: 'MAT-Files' },
    { group: 'project', heading: 'Projects' },
    { group: 'other', heading: 'Other' },
];
// A row's key, from what it stands for. As JSON, so no file id and section id can make the key
// of another row, whatever characters they hold.
const keyOf = (fileId, sectionId) => JSON.stringify(sectionId === undefined ? [fileId] : [fileId, sectionId]);
const ROOT_KEY = keyOf(null);
const sectionsOf = (file) => (Array.isArray(file.sections) ? file.sections : []);
/**
 * The open files, as the app shell's Explorer lists them: Root first, then each kind of file
 * under a heading of its own (Simulink Models, Data Dictionaries, MAT-Files, Projects, Other,
 * always in that order, and a heading only over files), each file with a twisty that opens it
 * onto its sections.
 *
 * It draws what it is given and asks for the rest. A click on a row sends `dex-explorer-open`
 * for it, unpinned; a double-click or Enter sends it pinned; a right-click on a file sends
 * `dex-explorer-menu`. Which file a row is, what opening it means and which row is the current
 * one are the app's: the row `selected` names is highlighted, and a click changes nothing of it.
 * Which files are open in the tree (their twisty) is the element's own, but for one thing: a
 * `selected` that moves to a section of a closed file opens that file, at once or as soon as the
 * file lists the section, and the row `selected` moves to is scrolled into view. A file that
 * leaves `files` is forgotten, so it comes back closed, and a focused row that leaves passes the
 * focus to the next row.
 *
 * The arrow keys walk the rows (the headings are no rows): Right opens a file or goes into it,
 * Left closes it or goes from a section to its file, Home and End go to the first and the last.
 *
 * Table rows dragged onto a file's row or a section's (a drag that carries `application/dex-rows`)
 * are the app's to judge too: on each dragover the element asks `dropPredictor` about the row under
 * the pointer, with the mode the keys held ask (a move; a copy with Option on macOS and Ctrl
 * elsewhere, as a drag in a table asks), and outlines the row in the accent for a drop it takes, in
 * the error colour for one it refuses, the answer's words its tooltip and said to a screen reader;
 * no answer draws nothing and takes no drop. The row carries the words in `data-drop-hint` too, and
 * `data-drop-refused` for a refusal, which the dragged table's box at the pointer says (the tree
 * table's `dragOut`): the browser shows no tooltip during a drag. A drop it still takes sends
 * `dex-explorer-drop`, in the mode of the last dragover. Root, a heading and a drag of anything else
 * are no drop target.
 *
 * @tagname dex-explorer
 */
export class DexExplorer extends LitElement {
    constructor() {
        super(...arguments);
        /**
         * The open files, in the order each heading lists them. Replacing them keeps open each file
         * still here (by its `id`) and forgets the rest. Default none: Root alone.
         */
        this.files = [];
        /**
         * The row to highlight: Root, a file, or a section of a file. Null, the default, highlights
         * none. The app sets it; the element never changes it, and setting it sends nothing. Moved to
         * another row, it scrolls that row into view once it is drawn; moved to a section of a closed
         * file, it opens the file, then or once a later `files` lists the section. The user may close
         * it again, and it stays closed until `selected` next moves to one of its sections.
         */
        this.selected = null;
        /** What the first row, the one for every open file at once, reads. Default `Root`. Attribute `root-label`. */
        this.rootLabel = 'Root';
        /**
         * What a drag of table rows let go over a file's row or a section's would do: asked on each
         * dragover of such a drag, with the row and the mode the keys held ask, and again as it is let go.
         * Its answer is drawn on the row (an outline, a tooltip, words for a screen reader) and decides
         * whether the row takes the drop; null takes none there and draws nothing (a drop that would do
         * nothing, a file that takes none). Null, the default: the explorer takes no drop. Property only.
         */
        this.dropPredictor = null;
        // The ids of the files open in the tree. The element's own: the app says which files there
        // are, and the user which of them to look into.
        this._open = new Set();
        // The row the keyboard is on, by key, and whether it is still to be given the focus once drawn.
        this._focusKey = null;
        this._focusPending = false;
        // The section `selected` moved to, while its file is not listed with it yet: an app lists a
        // file it has just opened with no sections, and reads them after its table is drawn.
        this._revealing = null;
        // The row `selected` moved to, to scroll into view once it is drawn.
        this._scrollKey = null;
        // The row a drag of table rows is over, by key, and what the predictor said of a drop there.
        this._drop = null;
        // The mode the last dragover asked for, which its drop is carried out in: Chromium on macOS often
        // reports the key as released by the time of the drop, as the tree table's comment says.
        this._dropMode = 'move';
        // A drag that ends anywhere ends the cue: the drag's source hears its end, and the window does.
        this._onDragEnded = () => {
            this._drop = null;
        };
    }
    static { this.styles = [hiddenStyles, css `
    :host {
      display: block;
      overflow: auto;
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--dex-font-size, 13px);
      color: var(--dex-color-text, #333);
    }

    [role='tree'] {
      outline: none;
      padding: 4px;
    }

    /* A heading is laid out as a row, with the indent's and the twisty's places kept (each takes
       the row's gap, the empty indent too), so its words line up with the icons of the files
       under it, as the prototype's do. */
    .row,
    .heading {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 22px;
      padding: 0 4px;
      white-space: nowrap;
      user-select: none;
    }

    .row {
      position: relative;
      border-radius: 3px;
      cursor: pointer;
      outline: none;
    }

    .row:hover {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    /* The selection's surface and its ink together, as the table's selected row. */
    .row[aria-selected='true'] {
      background: var(--dex-color-accent-bg, #cde4f7);
      color: var(--dex-selection-fg, #333);
    }

    .row:focus-visible {
      box-shadow: inset var(--dex-focus-ring, 0 0 0 2px rgba(0, 120, 212, 0.4));
    }

    /* Muted and smaller than a file's name, as the prototype's, but in the muted ink rather than its
       disabled grey, which is too faint to read at this size. */
    .heading {
      color: var(--dex-color-text-muted, #666);
      font-size: 11px;
    }

    .indent {
      flex-shrink: 0;
    }

    .twisty {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      font-size: 10px;
      color: var(--dex-color-text-secondary, #555);
      flex-shrink: 0;
    }

    .twisty.empty {
      visibility: hidden;
    }

    dex-icon {
      flex-shrink: 0;
    }

    .label {
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }

    /* The unsaved mark is a part of its own, after the name and the row's gap from it: a name too
       long for the sidebar gives way to the ellipsis, and the mark stays. The tab's dot, in its
       size and colour, so the two read as one fact. */
    .dirty {
      flex-shrink: 0;
      font-size: 10px;
      color: var(--dex-color-modified, #b45309);
    }

    /* A drag of table rows over the row: the outline the table's own rows draw for a drop they take
       (the accent) and one they refuse (the error colour), so a drop reads the same in both. */
    .row.drop-allowed {
      box-shadow: inset 0 0 0 2px var(--dex-color-accent, #0078d4);
    }

    .row.drop-refused {
      box-shadow: inset 0 0 0 2px var(--dex-color-error, #d32f2f);
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }

    @media (forced-colors: active) {
      .row[aria-selected='true'] {
        background: Highlight;
        color: HighlightText;
      }

      .row:focus-visible {
        outline: 2px solid CanvasText;
        outline-offset: -2px;
      }

      /* Forced colours take the box-shadow away: an outline instead, solid for a drop the row takes,
         dashed for one it refuses, so the two differ by more than a colour the user's theme picks. */
      .row.drop-allowed {
        outline: 2px solid Highlight;
        outline-offset: -2px;
      }

      .row.drop-refused {
        outline: 2px dashed CanvasText;
        outline-offset: -2px;
      }
    }
  `]; }
    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('dragend', this._onDragEnded, true);
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('dragend', this._onDragEnded, true);
    }
    willUpdate(changed) {
        // A file that is gone is forgotten, so the same file opened again later starts closed.
        if (changed.has('files')) {
            const ids = new Set(this._files().map((f) => f.id));
            if ([...this._open].some((id) => !ids.has(id)))
                this._open = new Set([...this._open].filter((id) => ids.has(id)));
        }
        if (changed.has('selected'))
            this._moved(changed.get('selected'));
        if (this._revealing && (changed.has('selected') || changed.has('files')))
            this._reveal();
        if (changed.has('files'))
            this._keepFocus();
    }
    // `selected` was set: a move to another row is scrolled to, and a move to a section waits for
    // its file to open. Setting the same place again counts for nothing: an app that does it, as a
    // new object on each redraw, neither scrolls the view the user has scrolled since nor opens a
    // file the user has closed since.
    _moved(before) {
        const selected = this.selected;
        const key = selected ? keyOf(selected.fileId, selected.sectionId) : null;
        if (key === (before ? keyOf(before.fileId, before.sectionId) : null))
            return;
        this._scrollKey = key;
        this._revealing =
            selected && selected.fileId !== null && selected.sectionId !== undefined
                ? { fileId: selected.fileId, sectionId: selected.sectionId }
                : null;
    }
    // The app named a section (from the location bar, say): its file opens, so the highlighted row
    // is there to see. Once the file lists the section, and then never again for that move: the
    // user may close the file afterwards. A section the file never lists opens nothing, since no
    // row of it would be highlighted; the wait ends when the selection moves on.
    _reveal() {
        const { fileId, sectionId } = this._revealing;
        const file = this._files().find((f) => f.id === fileId);
        if (!file || !sectionsOf(file).some((s) => s.id === sectionId))
            return;
        this._revealing = null;
        this._setOpen(file, true);
    }
    // A focused row that new files leave out (its file closed, a section gone as the file is read
    // again) would take the focus with it, to the page's body, and the keyboard would be lost.
    // The focus goes to the next row still drawn, as a list moves on past a deleted item; after
    // the last, to the one before. Read before this draw, so the rows are still the old ones.
    _keepFocus() {
        const active = this.shadowRoot?.activeElement;
        if (!(active instanceof HTMLElement) || active.getAttribute('role') !== 'treeitem')
            return;
        const was = [...this.renderRoot.querySelectorAll('[role="treeitem"]')].map((el) => el.dataset.key ?? '');
        const at = was.indexOf(active.dataset.key ?? '');
        const now = new Set(this._lines().map((l) => l.key));
        if (at < 0 || now.has(was[at]))
            return;
        this._focusKey =
            was.slice(at + 1).find((key) => now.has(key)) ??
                was.slice(0, at).reverse().find((key) => now.has(key)) ??
                ROOT_KEY;
        this._focusPending = true;
    }
    updated() {
        if (this._focusPending) {
            this._focusPending = false;
            this._rowElement(this._focusKey)?.focus();
        }
        const reveal = this._rowElement(this._scrollKey);
        if (reveal) {
            this._scrollKey = null;
            reveal.scrollIntoView?.({ block: 'nearest' });
        }
    }
    /**
     * Give the keyboard to the row `at` names: Root for `{ fileId: null }`, a file, or a section of an
     * open file, as the arrow keys would land on it. Whether the row took it: false for one not drawn
     * (a file not listed, a section of a closed file, an Explorer not drawn yet).
     */
    focusRow(at) {
        const row = this._rowElement(keyOf(at.fileId, at.sectionId));
        if (!row)
            return false;
        row.focus();
        return this.shadowRoot?.activeElement === row;
    }
    _files() {
        return Array.isArray(this.files) ? this.files : [];
    }
    /** The headings with files under them, in order, each with its rows. */
    _groups() {
        const files = this._files();
        // A group the list does not know (from an app that is not type-checked) is still a file:
        // listed under Other rather than dropped.
        const groupOf = (file) => GROUPS.some((g) => g.group === file.group) ? file.group : 'other';
        return GROUPS.flatMap(({ group, heading }) => {
            const members = files.filter((f) => groupOf(f) === group);
            if (members.length === 0)
                return [];
            const lines = [];
            members.forEach((file, i) => {
                const sections = sectionsOf(file);
                const open = sections.length > 0 && this._open.has(file.id);
                lines.push({ kind: 'file', key: keyOf(file.id), file, open, posInSet: i + 1, setSize: members.length });
                if (!open)
                    return;
                sections.forEach((section, j) => lines.push({
                    kind: 'section',
                    key: keyOf(file.id, section.id),
                    file,
                    section,
                    posInSet: j + 1,
                    setSize: sections.length,
                }));
            });
            return [{ group, heading, lines }];
        });
    }
    /** Every row drawn, in order, the headings left out: what the arrow keys walk. */
    _lines(groups = this._groups()) {
        return [{ kind: 'root', key: ROOT_KEY }, ...groups.flatMap((g) => g.lines)];
    }
    _selectedKey() {
        const selected = this.selected;
        return selected ? keyOf(selected.fileId, selected.sectionId) : null;
    }
    _rowElement(key) {
        if (key === null)
            return undefined;
        return [...this.renderRoot.querySelectorAll('[role="treeitem"]')].find((el) => el.dataset.key === key);
    }
    _setOpen(file, open) {
        if (sectionsOf(file).length === 0 || this._open.has(file.id) === open)
            return;
        const next = new Set(this._open);
        if (open)
            next.add(file.id);
        else
            next.delete(file.id);
        this._open = next;
    }
    _focus(key) {
        this._focusKey = key;
        this._focusPending = true;
        // A move of the user's: a scroll still waiting for its row is not done over it.
        this._scrollKey = null;
        // Asked for even when the key is the one already held (Home on the first row), so the focus
        // is given now and not at some later, unrelated update.
        this.requestUpdate();
    }
    _send(line, pin) {
        this._focusKey = line.key;
        this._scrollKey = null;
        const detail = line.kind === 'root'
            ? { fileId: null, pin }
            : line.kind === 'file'
                ? { fileId: line.file.id, pin }
                : { fileId: line.file.id, sectionId: line.section.id, pin };
        this.dispatchEvent(new CustomEvent('dex-explorer-open', { detail, bubbles: true, composed: true }));
    }
    // Only a file has a menu: Root and a section leave the event alone, so the page's own menu,
    // if any, is not taken from it for nothing. The context-menu key and Shift+F10 fire this event
    // on the focused row too, so the menu is a keyboard's as well.
    _onContextMenu(e, line) {
        if (line.kind !== 'file')
            return;
        e.preventDefault();
        this._focusKey = line.key;
        this.dispatchEvent(new CustomEvent('dex-explorer-menu', {
            detail: { fileId: line.file.id, x: e.clientX, y: e.clientY },
            bubbles: true,
            composed: true,
        }));
    }
    _onKeydown(e) {
        // A chord is the app's (the shell's Alt+Up goes up a level), never a move in the tree.
        if (e.altKey || e.ctrlKey || e.metaKey)
            return;
        const lines = this._lines();
        const at = Math.max(0, lines.findIndex((l) => l.key === this._focusKey));
        const line = lines[at];
        const go = (to) => {
            if (to)
                this._focus(to.key);
        };
        switch (e.key) {
            case 'ArrowDown':
                go(lines[at + 1]);
                break;
            case 'ArrowUp':
                go(lines[at - 1]);
                break;
            case 'Home':
                go(lines[0]);
                break;
            case 'End':
                go(lines[lines.length - 1]);
                break;
            case 'ArrowRight':
                if (line.kind !== 'file')
                    break;
                if (!line.open)
                    this._setOpen(line.file, true);
                else
                    go(lines[at + 1]);
                break;
            case 'ArrowLeft':
                if (line.kind === 'file' && line.open)
                    this._setOpen(line.file, false);
                else if (line.kind === 'section')
                    go(lines.find((l) => l.kind === 'file' && l.file.id === line.file.id));
                break;
            case 'Enter':
                this._send(line, true);
                break;
            default:
                return;
        }
        e.preventDefault();
    }
    // --- Table rows dropped on a file or a section ---------------------------------------------------
    // The file or section a row stands for, as a drop target, where the drag is one this list takes
    // (table rows) and the app judges drops (a predictor); none for Root.
    _dropTarget(e, line) {
        if (line.kind === 'root' || !this.dropPredictor || !carriesRows(e))
            return null;
        return line.kind === 'file' ? { fileId: line.file.id } : { fileId: line.file.id, sectionId: line.section.id };
    }
    _onDragOver(e, line) {
        const target = this._dropTarget(e, line);
        if (!target)
            return;
        const mode = dragModeFromModifiers(navigator.platform, { altKey: e.altKey, ctrlKey: e.ctrlKey });
        const verdict = this.dropPredictor(target, mode);
        this._dropMode = verdict?.effect ?? mode;
        if (!verdict) {
            this._drop = null;
            if (e.dataTransfer)
                e.dataTransfer.dropEffect = 'none';
            return;
        }
        // A new object only for a change: a dragover comes many times a second, and each would redraw.
        const was = this._drop;
        if (!was || was.key !== line.key || was.canDrop !== verdict.canDrop || was.tooltip !== verdict.tooltip) {
            this._drop = { key: line.key, canDrop: verdict.canDrop, tooltip: verdict.tooltip };
        }
        if (verdict.canDrop) {
            // A row that takes the drop must say so, or the browser sends no drop.
            e.preventDefault();
            if (e.dataTransfer)
                e.dataTransfer.dropEffect = this._dropMode;
        }
        else if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'none';
        }
    }
    // Off the row: but a move onto one of its own parts (its icon, its name) is a dragleave too.
    _onDragLeave(e, line) {
        const to = e.relatedTarget;
        if (to && e.currentTarget?.contains(to))
            return;
        if (this._drop?.key === line.key)
            this._drop = null;
    }
    _onDrop(e, line) {
        const target = this._dropTarget(e, line);
        if (!target)
            return;
        e.preventDefault();
        e.stopPropagation();
        this._drop = null;
        // Asked again as it lands, in the mode the last dragover showed: what it would do may have
        // changed since (the file was closed, or its rules came).
        const mode = this._dropMode;
        const verdict = this.dropPredictor(target, mode);
        if (!verdict?.canDrop)
            return;
        this.dispatchEvent(new CustomEvent('dex-explorer-drop', {
            detail: { ...target, mode: verdict.effect ?? mode },
            bubbles: true,
            composed: true,
        }));
    }
    _onTwisty(e, file) {
        // The twisty opens and closes, and asks for nothing.
        e.stopPropagation();
        this._focusKey = keyOf(file.id);
        this._setOpen(file, !this._open.has(file.id));
    }
    _label(line) {
        if (line.kind === 'root')
            return html `<span class="label">${this.rootLabel}</span>`;
        if (line.kind === 'section')
            return html `<span class="label">${line.section.label}</span>`;
        // The mark is its tab's: ● after the name, the row's gap the space before it (the prototype
        // wrote `*`, and the shell's tab ●: one fact, one mark). A screen reader hears what it means.
        const name = html `<span class="label">${line.file.label}</span>`;
        return line.file.dirty
            ? html `${name}<span class="dirty" aria-hidden="true">●</span><span class="sr-only">(unsaved changes)</span>`
            : name;
    }
    _icon(line) {
        if (line.kind === 'root')
            return html `<dex-icon .iconId=${'simulink_folder'} size="16"></dex-icon>`;
        const icon = line.kind === 'file' ? line.file.icon : line.section.icon;
        return icon ? html `<dex-icon .iconId=${icon} size="16"></dex-icon>` : nothing;
    }
    _row(line, selectedKey, tabbable) {
        const level = line.kind === 'section' ? 2 : 1;
        const twisty = line.kind === 'file' && sectionsOf(line.file).length > 0;
        const open = line.kind === 'file' && line.open;
        // A drag of table rows over it: its cue, and the predictor's words as its tooltip meanwhile, and as
        // the hint the dragged table's box at the pointer says (the browser shows no tooltip in a drag).
        const drop = this._drop?.key === line.key ? this._drop : null;
        const cue = drop ? (drop.canDrop ? ' drop-allowed' : ' drop-refused') : '';
        const title = drop?.tooltip || (line.kind === 'file' && line.file.title) || nothing;
        return html `
      <div
        class="row${cue}"
        role="treeitem"
        data-key=${line.key}
        aria-level=${level}
        aria-setsize=${line.kind === 'root' ? nothing : line.setSize}
        aria-posinset=${line.kind === 'root' ? nothing : line.posInSet}
        aria-expanded=${twisty ? String(open) : nothing}
        aria-selected=${String(line.key === selectedKey)}
        tabindex=${line.key === tabbable ? '0' : '-1'}
        title=${title}
        data-drop-hint=${drop ? drop.tooltip : nothing}
        data-drop-refused=${drop && !drop.canDrop ? '' : nothing}
        @click=${() => this._send(line, false)}
        @dblclick=${() => this._send(line, true)}
        @contextmenu=${(e) => this._onContextMenu(e, line)}
        @focus=${() => (this._focusKey = line.key)}
        @dragover=${(e) => this._onDragOver(e, line)}
        @dragleave=${(e) => this._onDragLeave(e, line)}
        @drop=${(e) => this._onDrop(e, line)}
      >
        <span class="indent" ${styleProps({ width: `${(level - 1) * 16}px` })}></span>
        <span
          class="twisty ${twisty ? '' : 'empty'}"
          aria-hidden="true"
          @click=${twisty && line.kind === 'file' ? (e) => this._onTwisty(e, line.file) : nothing}
          @dblclick=${twisty ? (e) => e.stopPropagation() : nothing}
          >${twisty ? (open ? '▼' : '▶') : ''}</span
        >
        ${this._icon(line)} ${this._label(line)}
      </div>
    `;
    }
    render() {
        const groups = this._groups();
        const lines = this._lines(groups);
        const selectedKey = this._selectedKey();
        // One row takes the Tab key: the one the keyboard was on, else the selected one, else Root.
        const tabbable = [this._focusKey, selectedKey].find((key) => key !== null && lines.some((l) => l.key === key)) ?? ROOT_KEY;
        // Keyed, so a row keeps its element as files come and go above it, and the focus stays on
        // the row it was on rather than on whatever row moves into its place. Before the tree, what a
        // drop on the row a drag is over would do, for a screen reader: the outline is the eye's.
        return html `
      <div class="sr-only" role="status" aria-live="polite">${this._drop?.tooltip ?? ''}</div>
      <div role="tree" aria-label="Open files" @keydown=${this._onKeydown}>
        ${this._row(lines[0], selectedKey, tabbable)}
        ${repeat(groups, (g) => g.group, (g) => html `
            <div role="group" aria-label=${g.heading}>
              <div class="heading" aria-hidden="true">
                <span class="indent"></span><span class="twisty empty"></span><span class="label">${g.heading}</span>
              </div>
              ${repeat(g.lines, (l) => l.key, (l) => this._row(l, selectedKey, tabbable))}
            </div>
          `)}
      </div>
    `;
    }
}
__decorate([
    property({ attribute: false })
], DexExplorer.prototype, "files", void 0);
__decorate([
    property({ attribute: false })
], DexExplorer.prototype, "selected", void 0);
__decorate([
    property({ attribute: 'root-label' })
], DexExplorer.prototype, "rootLabel", void 0);
__decorate([
    property({ attribute: false })
], DexExplorer.prototype, "dropPredictor", void 0);
__decorate([
    state()
], DexExplorer.prototype, "_open", void 0);
__decorate([
    state()
], DexExplorer.prototype, "_focusKey", void 0);
__decorate([
    state()
], DexExplorer.prototype, "_drop", void 0);
/** Registers the widget as `<dex-explorer>`, or under `tag`, and the `<dex-icon>` its rows draw. */
export function defineExplorer(tag = 'dex-explorer') {
    defineIcon();
    defineElement(tag, DexExplorer);
}
