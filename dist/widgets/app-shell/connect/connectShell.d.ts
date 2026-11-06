import type { DexAppShell } from '../dex-app-shell.js';
import type { ConnectShellOptions, ShellHandle } from './types.js';
/**
 * Fill an empty `<dex-app-shell>` with the app, over `options.host`, and return the handle the host
 * drives it by. The elements it builds must be defined first (the parts' define functions, and the
 * widgets the documents are shown in). Nothing is opened: the host opens files (`openPaths`) and
 * shows a folder (`showFolder`) when it has them.
 */
export declare function connectShell(shell: DexAppShell, options: ConnectShellOptions): ShellHandle;
