// Copyright 2026 The MathWorks, Inc.
//
// The project page's stylesheet, as a string injected at runtime by project-main.ts.
//
// WHY A STRING AND NOT A .css FILE. Two reasons, both structural:
//
//  1. The build emits exactly ONE stylesheet, under a name the host hardcodes
//     (`SHARED_STYLESHEET`), and `vite.config.ts` throws if a second distinct CSS
//     source ever appears — see the comment there. A `import './projectPage.css'`
//     would be that second source.
//  2. The vite dev shell (`project.html`) is a static file that cannot interpolate
//     anything the host builds, so page styles written into the host's markup would
//     need a hand copy there — the drift that `test/webviewOverlays.test.ts` exists
//     to catch for the banner strip.
//
// Injected rather than inlined in the host shell so there is exactly one copy for
// both shells. No flash of unstyled content: the page's markup is created by the
// same script, after this.
//
// Colours, fonts and sizes are the widgets' --dex-* tokens (theme.css), each read with
// the light theme's value as its fallback, so the page follows whatever theme the app
// loads and is still readable with none; vscode-theme.css maps every one of them onto
// the user's VS Code theme. The muted tone is a `color-mix` of the text colour rather
// than a theme's description or disabled colour, for the reason recorded in
// vscode-theme.css: those colours composite to under WCAG AA on VS Code's stock themes,
// and mixing the theme's own foreground toward transparency holds in any theme and over
// any surface the text actually sits on.
export const PROJECT_PAGE_CSS = `
/* The shared stylesheet locks the viewport (html,body{height:100%;overflow:hidden})
   because the table views are one absolutely-positioned element filling the panel.
   This view is a DOCUMENT: it is as tall as the project is and it scrolls. */
html, body { height: auto; overflow: visible; }
body {
  margin: 0;
  font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: var(--dex-font-size, 13px);
  color: var(--dex-color-text, #333);
  background: var(--dex-bg-primary, #fff);
  -webkit-font-smoothing: antialiased;
}
.dex-page * { box-sizing: border-box; }

/* A measure, not the full panel width: these are lines of prose-length text, and a
   path folder stretched across an ultrawide editor is unreadable. */
.dex-page {
  max-width: 860px; margin: 0 auto; padding: 26px 28px 80px;
  /* ONE muted tone for the whole page, at the one mix measured to clear WCAG AA in BOTH
     stock themes: 4.82:1 on light, 5.97:1 on dark. The tones that varied per surface did
     not survive measurement -- a 60% mix reads as comfortably muted on the dark theme at
     4.58:1 and lands at 3.48:1 on the light one, which is the same trap vscode-theme.css
     records about descriptionForeground. Anything fainter than this needs a measurement,
     not a preference. The fallback after each var(--dex-muted) is this mix over the light
     theme's text and page. */
  --dex-muted: color-mix(in srgb, var(--dex-color-text, #333) 72%, transparent);
}

.dex-page .identity { padding-bottom: 4px; }
.dex-page .identity h1 { margin: 0; font-size: 21px; font-weight: 600; letter-spacing: -0.01em; }
.dex-page .identity .root {
  margin-top: 5px; font-family: var(--dex-font-mono, 'SF Mono', 'Menlo', 'Monaco', monospace); font-size: 12px;
  color: var(--dex-muted, #6c6c6c);
  word-break: break-all;
}
.dex-page .identity .meta {
  margin-top: 8px; font-size: 12px;
  color: var(--dex-muted, #6c6c6c);
}
.dex-page .identity .meta .dot { opacity: .5; margin: 0 6px; }

.dex-page .section { margin-top: 30px; }
.dex-page .section > header {
  display: flex; align-items: baseline; gap: 10px;
  border-bottom: 1px solid var(--dex-border-color, #d0d0d0);
  padding-bottom: 5px; margin-bottom: 7px;
}
.dex-page .section h2 {
  margin: 0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .09em;
  color: var(--dex-muted, #6c6c6c);
}
.dex-page .section .count {
  font-size: 11px; font-variant-numeric: tabular-nums;
  color: var(--dex-muted, #6c6c6c);
}
.dex-page .section .spacer { flex: 1 1 auto; }

.dex-page input.filter {
  font: inherit; font-size: 11px; width: 190px; padding: 2px 6px;
  color: var(--dex-input-fg, #333);
  background: var(--dex-input-bg, #fff);
  border: 1px solid var(--dex-input-border, #c8c8c8);
  border-radius: 2px;
}
.dex-page input.filter::placeholder { color: var(--dex-input-placeholder-fg, #767676); opacity: .7; }
.dex-page input.filter:focus { outline: 1px solid var(--dex-color-accent, #0078d4); outline-offset: -1px; }

.dex-page .row {
  display: flex; gap: 14px; align-items: baseline;
  padding: 3px 7px; border-radius: 3px;
}
.dex-page .row:hover { background: var(--dex-bg-hover, #e8e8e8); }
.dex-page .row .name { flex: 0 0 auto; min-width: 190px; }
.dex-page .row .target {
  font-family: var(--dex-font-mono, 'SF Mono', 'Menlo', 'Monaco', monospace); font-size: 12px;
  color: var(--dex-muted, #6c6c6c);
  word-break: break-all;
}
.dex-page .row.single .name { min-width: 0; font-family: var(--dex-font-mono, 'SF Mono', 'Menlo', 'Monaco', monospace); font-size: 12px; }
/* a.link is NESTED inside .target, so this (one class + one element) must not be
   outspecified by ".row .target" (two classes) -- which is what happened when one
   element carried both classes: every link rendered in the muted body colour, i.e.
   the clickable rows did not look clickable. */
.dex-page a.link { color: var(--dex-color-link, #005fb8); text-decoration: none; cursor: pointer; }
.dex-page a.link:hover, .dex-page a.link:focus-visible { text-decoration: underline; }
.dex-page a.link:focus-visible { outline: 1px solid var(--dex-color-accent, #0078d4); outline-offset: 1px; }
.dex-page .muted { color: var(--dex-muted, #6c6c6c); }
.dex-page .empty {
  padding: 3px 7px; font-size: 12px; font-style: italic;
  color: var(--dex-muted, #6c6c6c);
}
.dex-page mark {
  background: var(--dex-match-highlight-bg, rgba(234, 92, 0, 0.33));
  color: inherit; border-radius: 2px;
}
.dex-page .group-label {
  margin: 8px 0 3px 7px; font-size: 11px; font-weight: 600;
  color: var(--dex-muted, #6c6c6c);
}
.dex-page .group-label:first-child { margin-top: 0; }

/* The same palette as the table views' warning banner (BANNERS_HTML), so "this file
   did not read whole" looks the same wherever it is said. */
.dex-page .warning {
  padding: 6px 10px; border-radius: 3px; font-size: 12px;
  color: var(--dex-warning-fg, #333);
  background: var(--dex-warning-bg, rgba(255, 190, 60, 0.12));
  border: 1px solid var(--dex-warning-border, #b89500);
  margin-bottom: 18px;
}
.dex-page .warning .headline { font-weight: 600; }
.dex-page .warning ul { margin: 4px 0 0; padding-inline-start: 18px; }

.dex-page .runs {
  padding: 8px 10px; border-radius: 4px;
  background: var(--dex-bg-tertiary, #f5f5f5);
  border: 1px solid var(--dex-border-color-light, #e0e0e0);
}
.dex-page .runs .row { padding: 2px 0; }
.dex-page .runs .row .name { min-width: 92px; font-weight: 500; }
.dex-page .runs .ord {
  display: inline-block; min-width: 14px; margin-right: 4px; text-align: right;
  opacity: .55; font-variant-numeric: tabular-nums;
}

/* The Managed Simulink Project card (PROOF OF CONCEPT). Same card treatment as .runs,
   because it says the same KIND of thing: a handful of facts that are about the project
   rather than a list of its contents. */
.dex-page .msp {
  padding: 8px 10px; border-radius: 4px;
  background: var(--dex-bg-tertiary, #f5f5f5);
  border: 1px solid var(--dex-border-color-light, #e0e0e0);
}
.dex-page .msp .row { padding: 2px 0; }
.dex-page .msp .row .name { min-width: 92px; }
/* Indented past the badge column AND the row gap (92 + 14), so the sentence starts under
   the path it is about rather than between the two columns. */
.dex-page .msp .note {
  margin: 1px 0 8px 106px; font-size: 11px; line-height: 1.45; max-width: 62ch;
  color: var(--dex-muted, #6c6c6c);
}
.dex-page .msp .note:last-child { margin-bottom: 0; }

/* The badge that carries a new concept's NAME -- 'interface', 'private', 'component'.
   A WORD and not an icon: media/icons/ ships simulink_component.svg and
   serviceInterfaces.svg, but every icon there paints itself through var(--mw-icon-*)
   tokens this extension never defines, so all of them render at their light-theme
   fallback (white fill, grey stroke) in every theme -- and an <img> gets no
   forced-colours treatment at all. --dex-tag-bg/--dex-tag-fg is a themed PAIR (VS Code's
   badge colours, in vscode-theme.css), so its contrast is the theme author's guarantee
   rather than our mix. */
.dex-page .badge {
  display: inline-flex; align-items: center;
  padding: 0 7px; border-radius: 3px;
  font-size: 11px; font-weight: 600; letter-spacing: .02em;
  border: 1px solid var(--dex-border-color, #d0d0d0);
  background: var(--dex-tag-bg, #e0e0e0);
  color: var(--dex-tag-fg, #333);
}

.dex-page .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 3px 7px; }
.dex-page .chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 1px 9px; border-radius: 11px; font-size: 12px;
  border: 1px solid var(--dex-border-color, #d0d0d0);
}
.dex-page .chip .n { font-variant-numeric: tabular-nums; color: var(--dex-muted, #6c6c6c); }
.dex-page .chip.unused { opacity: .5; }
.dex-page .chip.custom { border-style: dashed; }

.dex-page button.more {
  margin: 5px 0 0 7px; font: inherit; font-size: 11px; cursor: pointer;
  color: var(--dex-color-link, #005fb8); background: none; border: 0; padding: 2px 0;
}
.dex-page button.more:hover { text-decoration: underline; }

/* A dashed border and an opacity are both invisible in a forced-colours theme, where
   the OS replaces every colour we asked for. Say the same two things with properties
   it keeps. */
@media (forced-colors: active) {
  .dex-page .chip { border-color: CanvasText; }
  /* The badge's themed background is replaced by the OS, so the border is what is left
     to say "this is a label on the row" -- same treatment as the chip. */
  .dex-page .badge { border-color: CanvasText; }
  .dex-page .chip.unused { opacity: 1; color: GrayText; }
  .dex-page .chip.custom { border-style: dashed; }
  .dex-page a.link { color: LinkText; }
  .dex-page mark { background: Highlight; color: HighlightText; }
}
`;
