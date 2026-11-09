// Copyright 2026 The MathWorks, Inc.

import { css } from 'lit';

/**
 * The look the shell's popovers share (`<dex-settings-panel>`, `<dex-about-panel>`): a small card
 * floating beside the activity-bar button that opened it.
 *
 * The host is the fixed box show() places, in viewport px; it is shrink-wrapped round the card, so
 * what show() measures is the card's size. Nothing shows until show(): the host is `display: none`
 * without the `open` attribute, and the card itself is not rendered.
 *
 * The card is capped at the viewport and scrolls inside: placeBeside puts a card bigger than the
 * window at its top left corner, and the cap is what keeps the rest of it reachable there.
 */
export const popoverStyles = css`
  :host {
    display: none;
    position: fixed;
    z-index: 10000;
  }

  :host([open]) {
    display: block;
  }

  .popover {
    box-sizing: border-box;
    max-width: 100vw;
    max-height: 100vh;
    overflow: auto;
    padding: 12px;
    background: var(--dex-bg-primary, #fff);
    border: 1px solid var(--dex-border-color, #d0d0d0);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    color: var(--dex-color-text, #333);
    font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
    font-size: 12px;
    white-space: nowrap;
    /* The card takes focus when it has nothing focusable of its own (About): a ring round the
       whole card would only say that it opened. */
    outline: none;
  }

  /* The card's title in capitals, as the side bars' section titles are (EXPLORER): SETTINGS,
     and the About card's heading. */
  .title {
    margin-bottom: 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--dex-color-text-secondary, #555);
  }
`;
