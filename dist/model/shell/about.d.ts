/** One line of About: a label and its value, and the heading of the section it is in, if any. */
export interface AboutLine {
    /** What the line names: Version, Build date, data-explorer-view. */
    label: string;
    /** Its value: 1.0.0. */
    value: string;
    /**
     * The heading of the section the line is in (Built on, Dependencies). Default none (and an empty
     * heading is none): the line is under the app's name, before every section.
     */
    section?: string;
}
/** A section of About as it is drawn: its heading (null for the lines under the app's name) and its lines. */
export interface AboutSection {
    heading: string | null;
    lines: AboutLine[];
}
/**
 * The lines in the sections About draws: those with no section first, under the app's name, then
 * each section in the order its first line comes, every line in the order it has in `lines`. Two
 * headings are one section only when they are the same text. A section has at least one line.
 */
export declare function aboutSections(lines: readonly AboutLine[]): AboutSection[];
