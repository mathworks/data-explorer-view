// Copyright 2026 The MathWorks, Inc.
//
// Files and folders dragged from the OS onto the page go to `drop`: what they are is the host's to
// say (Electron's preload reads a path off each one, and shows a folder or opens a file; a browser
// page reads the files' bytes). Captured before any widget sees the drag, so a table's own row-drop
// handling never decides a file drop.
//
// Lifted from data-explorer-app src/renderer/ui/dropOpen.ts at 0983920. It listens on `target` (the
// window, or the element the files may be dropped on) rather than on the window always, hands over
// the drop's DataTransfer whole rather than its files (a browser host may want its items, to tell a
// folder from a file), and can be taken away again. While a file drag is over it, the target (the
// body, for the window) has the class `drop-target`, for the page's own stylesheet to mark it.

/** Send the files dropped on `target` to `drop`; returns what takes the listeners away again. */
export function installFileDrop(target: HTMLElement | Window, drop: (data: DataTransfer) => void): () => void {
  const isFileDrag = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  const marked = (): HTMLElement => (target instanceof HTMLElement ? target : document.body);
  const over = (e: Event): void => {
    const drag = e as DragEvent;
    if (!isFileDrag(drag)) return;
    drag.preventDefault();
    drag.stopPropagation();
    drag.dataTransfer!.dropEffect = 'copy';
    marked().classList.add('drop-target');
  };
  // Off the window (no element entered), or, for an element, onto one outside it: a move between
  // its own children is a dragleave too, and the mark stays.
  const leave = (e: Event): void => {
    const to = (e as DragEvent).relatedTarget as Node | null;
    if (!to || (target instanceof HTMLElement && !target.contains(to))) marked().classList.remove('drop-target');
  };
  const dropped = (e: Event): void => {
    const drag = e as DragEvent;
    if (!isFileDrag(drag)) return;
    drag.preventDefault();
    drag.stopPropagation();
    marked().classList.remove('drop-target');
    if (drag.dataTransfer!.files.length) drop(drag.dataTransfer!);
  };
  target.addEventListener('dragover', over, true);
  target.addEventListener('dragleave', leave);
  target.addEventListener('drop', dropped, true);
  return () => {
    target.removeEventListener('dragover', over, true);
    target.removeEventListener('dragleave', leave);
    target.removeEventListener('drop', dropped, true);
    marked().classList.remove('drop-target');
  };
}
