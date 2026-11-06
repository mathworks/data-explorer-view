// Copyright 2026 The MathWorks, Inc.

import { css } from 'lit';

/**
 * The look of `<dex-relationship-graph>`, as the prototype drew its relationship graph: a grey
 * canvas, a box per file in its kind's colour (a model blue, a dictionary green, a MAT-file sand) with
 * a soft shadow, a file not open dashed, the items of an open box in pale rows, a model's workspace
 * variables under a dashed divider, edges in their kind's colour with a dot where they leave and an
 * arrowhead where they arrive, and the zoom buttons and the Legend floating over the corners.
 *
 * Every colour is a `--dex-graph-*` token (or a shared one) so each theme sets its own; SVG takes a
 * stroke and a fill from CSS as any element takes a colour, so the edges and markers are themed by
 * class rather than by attribute.
 */
export const relationshipGraphStyles = css`
  :host {
    display: block;
    position: relative;
    overflow: hidden;
    width: 100%;
    height: 100%;
    min-height: 120px;
    background: var(--dex-bg-tertiary, #f5f5f5);
    font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
    color: var(--dex-color-text, #333);
  }

  /* The canvas is the whole host; the world inside it is the graph at its own size, moved and
     scaled by the view. */
  .canvas {
    position: absolute;
    inset: 0;
    overflow: hidden;
    outline: none;
    cursor: grab;
    touch-action: none;
  }

  .canvas.panning {
    cursor: grabbing;
  }

  .canvas:focus-visible {
    box-shadow: inset var(--dex-focus-ring, 0 0 0 2px rgba(0, 120, 212, 0.4));
  }

  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    text-align: center;
    font-size: var(--dex-font-size, 13px);
    color: var(--dex-color-text-muted, #666);
    cursor: default;
  }

  .world {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
  }

  svg.edges {
    position: absolute;
    left: 0;
    top: 0;
    overflow: visible;
    pointer-events: none;
  }

  path.edge {
    fill: none;
    stroke-width: 1.5;
    transition: opacity 0.15s ease, stroke-width 0.15s ease;
  }

  /* The edges under the boxes take the pointer, so one can be picked out by hovering it. The
     ones over the boxes never do: they would take the clicks meant for the items under them. */
  .under path.edge {
    stroke-width: 1.2;
    opacity: 0.8;
    pointer-events: stroke;
  }

  .under path.edge:hover {
    stroke-width: 2.5;
    opacity: 1;
  }

  .over path.edge,
  path.stub {
    stroke-width: 1.8;
  }

  path.stub {
    fill: none;
  }

  path.edge.dim,
  path.stub.dim {
    opacity: 0.2;
  }

  .model-ref {
    stroke: var(--dex-graph-edge-model-ref, #7ba3c4);
    fill: var(--dex-graph-edge-model-ref, #7ba3c4);
  }

  .sldd-ref {
    stroke: var(--dex-graph-edge-sldd-ref, #7bab8a);
    fill: var(--dex-graph-edge-sldd-ref, #7bab8a);
  }

  .data-link {
    stroke: var(--dex-graph-edge-data-link, #8a9a6b);
    fill: var(--dex-graph-edge-data-link, #8a9a6b);
  }

  .param-usage {
    stroke: var(--dex-graph-edge-param-usage, #9b8bb4);
    fill: var(--dex-graph-edge-param-usage, #9b8bb4);
  }

  .ws-usage {
    stroke: var(--dex-graph-edge-ws-usage, #6b9b8b);
    fill: var(--dex-graph-edge-ws-usage, #6b9b8b);
  }

  /* The markers' shapes are filled, not stroked. */
  marker * {
    stroke-width: 0;
  }

  /* A label is read as text, so it is inked as text, not in its edge's colour: an 8px word in a
     mid-tone purple on the canvas could not be read. */
  text.edge-label {
    font-size: 8px;
    fill: var(--dex-color-text-secondary, #555);
  }

  .box {
    position: absolute;
    box-sizing: border-box;
    border: 2px solid;
    border-radius: 6px;
    cursor: pointer;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.12));
    transition: opacity 0.15s ease;
  }

  .box:hover {
    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.18));
  }

  .box.model {
    background: var(--dex-graph-model-bg, #e8f0f7);
    border-color: var(--dex-graph-model-border, #8bafc4);
  }

  .box.sldd {
    background: var(--dex-graph-sldd-bg, #e8f4ec);
    border-color: var(--dex-graph-sldd-border, #8bb8a0);
  }

  .box.mat {
    background: var(--dex-graph-mat-bg, #f4f0e8);
    border-color: var(--dex-graph-mat-border, #c4b08b);
  }

  /* Selected: a darker border, a pixel wider by a ring outside it, so nothing inside moves. */
  .box.model.selected {
    border-color: var(--dex-graph-model-selected, #4a7a99);
    box-shadow: 0 0 0 1px var(--dex-graph-model-selected, #4a7a99);
  }

  .box.sldd.selected {
    border-color: var(--dex-graph-sldd-selected, #4a8a66);
    box-shadow: 0 0 0 1px var(--dex-graph-sldd-selected, #4a8a66);
  }

  .box.mat.selected {
    border-color: var(--dex-graph-mat-selected, #8a7044);
    box-shadow: 0 0 0 1px var(--dex-graph-mat-selected, #8a7044);
  }

  .box.ghost {
    border-style: dashed;
  }

  .box.ghost .label {
    color: var(--dex-color-text-muted, #666);
  }

  .box.dim {
    opacity: 0.2;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 40px;
    padding: 0 6px 0 8px;
    font-size: 11px;
  }

  .box.open .head,
  .box.partial .head {
    height: 28px;
  }

  .label,
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  dex-icon {
    flex-shrink: 0;
  }

  button.toggle {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    padding: 0;
    border: 1px solid var(--dex-border-color, #d0d0d0);
    border-radius: 3px;
    background: var(--dex-bg-primary, #fff);
    color: var(--dex-color-text-secondary, #555);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    opacity: 0.6;
  }

  .box:hover button.toggle,
  .box.selected button.toggle,
  button.toggle:hover {
    opacity: 1;
  }

  .item {
    position: absolute;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px;
    border: 1px solid var(--dex-graph-item-border, rgba(0, 0, 0, 0.1));
    border-radius: 3px;
    background: var(--dex-graph-item-bg, rgba(0, 0, 0, 0.04));
    font-size: 10px;
    transition: opacity 0.15s ease;
  }

  .item.workspace {
    background: var(--dex-graph-ws-item-bg, rgba(107, 155, 139, 0.08));
    border-color: var(--dex-graph-ws-item-border, rgba(107, 155, 139, 0.25));
  }

  .item.selected {
    border-color: var(--dex-color-accent, #0078d4);
    box-shadow: 0 0 0 1px var(--dex-color-accent, #0078d4);
  }

  .item.dim {
    opacity: 0.25;
  }

  /* The line between a model's blocks and its workspace variables, named on its left. */
  .divider {
    position: absolute;
    left: 8px;
    right: 8px;
    height: 0;
    border-top: 1px dashed var(--dex-border-color, #d0d0d0);
  }

  .divider span {
    position: absolute;
    left: 50%;
    bottom: 1px;
    transform: translateX(-50%);
    font-size: 8px;
    color: var(--dex-color-text-muted, #666);
    white-space: nowrap;
  }

  .zoom {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .zoom button,
  .legend-toggle {
    border: 1px solid var(--dex-border-color, #d0d0d0);
    border-radius: 4px;
    background: var(--dex-bg-primary, #fff);
    color: var(--dex-color-text-secondary, #555);
    cursor: pointer;
    font-family: inherit;
  }

  .zoom button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .zoom button:hover,
  .legend-toggle:hover {
    background: var(--dex-bg-hover, #e8e8e8);
  }

  .zoom button:active {
    background: var(--dex-bg-active, #e0e0e0);
  }

  .legend {
    position: absolute;
    left: 8px;
    bottom: 8px;
    max-height: calc(100% - 16px);
    overflow: auto;
    font-size: 10px;
    color: var(--dex-color-text-secondary, #555);
  }

  .legend-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-size: 10px;
    font-weight: 600;
  }

  .legend-toggle::before {
    content: '\\25B6';
    font-size: 8px;
  }

  .legend-toggle[aria-expanded='true']::before {
    content: '\\25BC';
  }

  .legend-content {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin: 4px 0 0;
    padding: 6px 10px;
    list-style: none;
    background: var(--dex-bg-primary, #fff);
    border: 1px solid var(--dex-border-color, #d0d0d0);
    border-radius: 6px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  }

  .legend-content li {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .swatch {
    flex-shrink: 0;
  }

  .swatch.line {
    width: 20px;
    height: 0;
    border-top: 2px solid;
  }

  .swatch.line.model-ref {
    border-color: var(--dex-graph-edge-model-ref, #7ba3c4);
  }

  .swatch.line.sldd-ref {
    border-color: var(--dex-graph-edge-sldd-ref, #7bab8a);
  }

  .swatch.line.data-link {
    border-color: var(--dex-graph-edge-data-link, #8a9a6b);
  }

  .swatch.line.param-usage {
    border-color: var(--dex-graph-edge-param-usage, #9b8bb4);
  }

  .swatch.line.ws-usage {
    border-color: var(--dex-graph-edge-ws-usage, #6b9b8b);
  }

  .swatch.box {
    width: 14px;
    height: 10px;
    box-sizing: border-box;
    border: 1.5px solid;
    border-radius: 2px;
  }

  .swatch.box.model {
    background: var(--dex-graph-model-bg, #e8f0f7);
    border-color: var(--dex-graph-model-border, #8bafc4);
  }

  .swatch.box.sldd {
    background: var(--dex-graph-sldd-bg, #e8f4ec);
    border-color: var(--dex-graph-sldd-border, #8bb8a0);
  }

  .swatch.box.mat {
    background: var(--dex-graph-mat-bg, #f4f0e8);
    border-color: var(--dex-graph-mat-border, #c4b08b);
  }

  .swatch.box.ghost {
    background: var(--dex-bg-secondary, #f8f8f8);
    border-color: var(--dex-color-text-disabled, #999);
    border-style: dashed;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    path.edge,
    .box,
    .item {
      transition: none;
    }
  }

  /* Forced colours paint no SVG stroke and no background of their own: the boxes take the
     system's ink for a border, the edges its text colour, and a selection its highlight. */
  @media (forced-colors: active) {
    .box,
    .item {
      border-color: CanvasText;
    }

    path.edge,
    marker * {
      stroke: CanvasText;
      fill: CanvasText;
    }

    path.edge {
      fill: none;
    }

    .box.selected,
    .item.selected {
      outline: 2px solid Highlight;
    }

    .canvas:focus-visible {
      outline: 2px solid CanvasText;
      outline-offset: -2px;
    }
  }
`;
