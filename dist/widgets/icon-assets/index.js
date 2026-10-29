// Copyright 2026 The MathWorks, Inc.
// `data-explorer-view/icon-assets`: the icons as assets of an app's bundle. Opt-in: an app that
// serves the icons/ folder itself (and tells the widgets where, with setIconBase) never imports it.
import { setIconUrls } from '../shared/dex-icon.js';
import { ICON_ASSETS } from './assets.js';
export { ICON_ASSETS };
/**
 * Draws every `<dex-icon>` from the icon files the app's bundler copied, with no copy step and no
 * setIconBase: this module names each icon as `new URL('…/<id>.svg', import.meta.url)`, which Vite,
 * webpack 5 and Parcel turn into an asset of the build. Call it once, before the first icon is
 * drawn, as setIconBase; a setIconBase after it goes back to a folder.
 *
 * Importing this entry is what puts the icons into a bundle — all of them, renamed — so an app
 * that ships the folder as files already (VS Code's extension does) leaves it out.
 */
export function useIconAssets() {
    setIconUrls(ICON_ASSETS);
}
