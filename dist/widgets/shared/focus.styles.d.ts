/**
 * Shared focus ring styles for interactive elements.
 *
 * Provides targeted selectors for common focusable element patterns:
 * - Buttons (native <button> elements)
 * - ARIA tab roles
 * - ARIA menuitem roles
 * - Elements with explicit tabindex
 *
 * Components include the variant that matches their focusable elements.
 * If a component has mixed focus-ring needs (some inset, some not),
 * keep the component-specific rules and use these only where they apply cleanly.
 */
/**
 * Standard (outward) focus ring for <button> elements.
 * Applies to all native button elements within the shadow root.
 */
export declare const buttonFocusRingStyles: import("lit").CSSResult;
/**
 * Standard (outward) focus ring for elements with tabindex attribute.
 * Useful for custom interactive spans/divs that use tabindex="0".
 */
export declare const tabindexFocusRingStyles: import("lit").CSSResult;
/**
 * Inset focus ring for ARIA tab role elements.
 * For tab items inside a tab bar where inset focus is preferred.
 */
export declare const tabRoleFocusRingStyles: import("lit").CSSResult;
/**
 * Inset focus ring for ARIA menuitem role elements.
 * For menu items inside dropdown/context menus.
 */
export declare const menuitemFocusRingStyles: import("lit").CSSResult;
