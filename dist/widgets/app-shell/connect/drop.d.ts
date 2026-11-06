/** Send the files dropped on `target` to `drop`; returns what takes the listeners away again. */
export declare function installFileDrop(target: HTMLElement | Window, drop: (data: DataTransfer) => void): () => void;
