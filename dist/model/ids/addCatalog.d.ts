/** The dictionary sections a tile can write into. Core spells them this way too. */
export type SectionKey = 'design' | 'arch' | 'config';
/** One tile: a button that creates one entry of one class in one section. */
export interface GalleryTile {
    /**
     * What the tile says. Domain wording, not the class name.
     *
     * One line, always — this is the canonical name, and it is what the accessible name
     * and the title reach for. How the label is BROKEN across lines on the face of a tile
     * is a drawing question, answered by `labelLinesOf` below.
     */
    label: string;
    /** The `$class` core is asked to create. */
    className: string;
    /** The section the new entry joins. Per-tile, so there is no "current section". */
    section: SectionKey;
    /**
     * The glyph the tile draws — which must be the glyph core gives the entry this
     * tile creates. Not a convention: the guard test creates the node and compares.
     * A tile whose art differs from the row it produces is a tile that lies.
     */
    iconId: string;
    /**
     * How to break the label across the tile's lines, where one word per line is wrong.
     *
     * Needed by exactly one tile today (see `labelLinesOf`), so it is an exception rather
     * than data every tile repeats. The guard test holds it to spelling the same label:
     * joined with spaces it must equal `label`, or the tile would draw a name nothing else
     * in the extension knows.
     */
    labelLines?: readonly string[];
}
/** One heading and the tiles under it. */
export interface GalleryCategory {
    title: string;
    /**
     * The section every tile here lands in, or null when they disagree.
     *
     * This is what decides where the destination is stated. A uniform category says it
     * once in its heading and badges nothing; a mixed one badges the tiles that depart
     * from its majority. Derived rather than declared, so it cannot fall out of step
     * with the tiles (see `categorySection`).
     */
    readonly uniformSection: SectionKey | null;
    readonly tiles: readonly GalleryTile[];
}
/** The section's own name, as the dictionary tree spells it. */
export declare const SECTION_LABEL: Record<SectionKey, string>;
/** The short form a badge carries, where a full section name would not fit. */
export declare const SECTION_BADGE: Record<SectionKey, string>;
/**
 * The gallery, in display order.
 *
 * Grouped by KIND — Parameters, Signals and Buses, Interfaces, Types, Variants,
 * Configurations — because those six are the vocabulary of the domain: you look for a
 * bus under "Signals and Buses" without being told to. Grouping by destination section
 * would have been self-documenting but longer, since a class legal in two sections
 * would appear under two headings instead of once with a badge.
 *
 * 22 distinct classes make 28 tiles. The three types and the two buses that both
 * Design and Architectural Data admit each appear twice, because they mean different
 * things in each — an arch `Simulink.Bus` is a Data Interface, and it draws with the
 * arch palette.
 */
export declare const ADD_CATALOG: readonly GalleryCategory[];
/**
 * The `(className, section)` pairs core allows but the gallery will not offer.
 *
 * Stated rather than implied, and checked one-directionally by the guard test: with
 * this list, losing a tile by accident fails a test, while dropping one on purpose is
 * a line moved from ADD_CATALOG to here. Widening core's allow-list without doing
 * either also fails.
 */
export declare const OMITTED: readonly {
    className: string;
    section: string;
    why: string;
}[];
/**
 * The classes core says a MAT-file can take a new variable of (MatNode.getAllowedTypes) that its
 * gallery will not offer, stated as OMITTED is for a dictionary's and checked by the same guard.
 *
 * A string is made by typing one: a MATLAB Variable's Value typed `"abc"` becomes a string variable
 * in core, as in a dictionary, so a tile of its own would be a second way to the same variable.
 */
export declare const MAT_OMITTED: readonly {
    className: string;
    why: string;
}[];
/**
 * A MAT-file's gallery: the tiles of `classes`, the classes core says the file can take a new
 * variable of (MatNode.getAllowedTypes), and no other. A MAT-file has no sections, so a class is
 * offered once, by its Design Data tile, and one with none (MAT_OMITTED) is not offered; the
 * Architectural Data tiles of the same classes, and every class core does not list (an
 * enumeration, the variants, a configuration set), are left out, and so is a category none of
 * whose tiles is left. Every category left is Design Data's alone, so no tile is badged.
 */
export declare function matCatalog(classes: readonly string[]): GalleryCategory[];
/** Every tile, flat, in display order — the order a keyboard walk follows. */
export declare function allTiles(): GalleryTile[];
/**
 * The lines this tile's label draws on — one word per line, unless the tile says otherwise.
 *
 * The break is chosen here rather than left to the text box, and that is what lets a tile be
 * narrow. A wrapping box has to be as wide as the longest LABEL before it breaks anywhere
 * sensible ("Simulink Parameter" is 18 characters); breaking at the space ourselves means a
 * tile only has to be as wide as the widest WORD, which is "Connection" at 65px measured. The
 * popover went from 380px to 300px as a direct result, and no label is at the mercy of where
 * its box happened to run out.
 *
 * Deliberately not `white-space: pre-line` over a label with a newline in it: `label` is the
 * name the accessible name, the title and the event all carry, and a newline inside it would
 * travel with them into a tooltip and a screen reader.
 */
export declare function labelLinesOf(tile: GalleryTile): readonly string[];
/**
 * The badge this tile needs under this category, or null when it needs none.
 *
 * A uniform category states its destination in the heading, so nothing is badged. In a
 * mixed one the badge goes on the tiles that depart from the majority. That keeps the count of
 * badges at the 5 that carry information rather than the 14 that would repeat their heading.
 *
 * There was a third rule here — a tile whose own LABEL named its destination suppressed its own
 * badge, since `Variant Config` in a `Config` corner reads as a warning about nothing
 * (maintainer, F6 2026-09-29). It is gone with the case that needed it: that tile's destination
 * is Design Data, measured (see the Variants category), so its category is uniform and the
 * general rule already badges nothing.
 */
export declare function badgeOf(category: GalleryCategory, tile: GalleryTile): string | null;
/** The section most of a mixed category's tiles land in — what its heading says. */
export declare function majoritySection(category: GalleryCategory): SectionKey;
/**
 * The section a category's heading names: its uniform destination, or the majority one
 * that the badges are read against.
 */
export declare function categorySection(category: GalleryCategory): SectionKey;
