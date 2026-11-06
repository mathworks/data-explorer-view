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
export declare const popoverStyles: import("lit").CSSResult;
