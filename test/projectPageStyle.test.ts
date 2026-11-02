// Copyright 2026 The MathWorks, Inc.
//
// PROJECT_PAGE_CSS (src/widgets/project-page/projectPageStyle.ts), the stylesheet the project page
// draws with, exported for a page that draws the HTML itself and puts it in its document. Its
// document half is the part <dex-project-page> cannot use from its shadow root: an app's shared
// stylesheet locks the viewport for its full-bleed table views (html, body { height: 100%;
// overflow: hidden }), and a project page is a document that is as tall as the project and
// scrolls. Ported from data-explorer-vscode test/projectMain.test.ts › the project page webview ›
// injects its stylesheet before painting, so nothing flashes unstyled, at 632f6e0, which read it
// out of the document its webview entry injects it into.
import { describe, it, expect } from 'vitest';
import { PROJECT_PAGE_CSS } from '../src/widgets/project-page/index.js';

/** The declarations of the first rule whose selector list is exactly `selector`. */
function rule(css: string, selector: string): string | null {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].trim().replace(/\s+/g, ' ') === selector) return m[2];
  }
  return null;
}

describe('PROJECT_PAGE_CSS', () => {
  it("carries the document's half: html and body grow with the page and scroll, beside the page's own rules", () => {
    const doc = rule(PROJECT_PAGE_CSS, 'html, body');
    expect(doc, 'an html, body rule').not.toBeNull();
    expect(doc).toMatch(/(^|;)\s*height:\s*auto\s*(;|$)/);
    expect(doc).toMatch(/(^|;)\s*overflow:\s*visible\s*(;|$)/);
    expect(rule(PROJECT_PAGE_CSS, '.dex-page'), 'the page itself').not.toBeNull();
  });
});
