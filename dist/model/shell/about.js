// Copyright 2026 The MathWorks, Inc.
//
// What the app shell's About popover lists: the lines an app hands it (connectShell's `about`),
// each a label and its value, some under a section's heading. The prototype's About had the app's
// own lines (its version, its build date) and then a Dependencies section; an app here says what
// it is built on the same way, a line for view's version and one for core's under one heading.
//
// The lines are the app's, in its order. An app that builds its list from parts (its own lines,
// then the versions, then a line it adds later) may leave a section's lines apart, and a section
// drawn as its lines come would be headed twice: so they are grouped here, each section once.
//
// DOM-free: the popover draws what aboutSections returns.
/**
 * The lines in the sections About draws: those with no section first, under the app's name, then
 * each section in the order its first line comes, every line in the order it has in `lines`. Two
 * headings are one section only when they are the same text. A section has at least one line.
 */
export function aboutSections(lines) {
    // The unsectioned lines' place is first, whether or not the first line is one of them.
    const sections = new Map([[null, []]]);
    for (const line of lines) {
        const heading = line.section || null;
        const into = sections.get(heading);
        if (into)
            into.push(line);
        else
            sections.set(heading, [line]);
    }
    return [...sections].filter(([, into]) => into.length > 0).map(([heading, into]) => ({ heading, lines: into }));
}
