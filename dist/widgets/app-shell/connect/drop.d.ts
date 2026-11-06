/** Send the files dropped on `target` to `drop`; returns what takes the listeners away again. */
export declare function installFileDrop(target: HTMLElement | Window, drop: (data: DataTransfer) => void): () => void;
/**
 * Tell `mark` whether files are being dragged over `el`, to be dropped where installFileDrop takes
 * them: whether `el` or an element around it, up to the page's root and through any shadow root it
 * is in, has the class it marks its target with (the body, for a drop installed on the window).
 * Told once at once, then at each change, and false when stopped; returns what stops it.
 */
export declare function followDropMark(el: Element, mark: (dragging: boolean) => void): () => void;
