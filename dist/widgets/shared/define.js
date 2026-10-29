// Copyright 2026 The MathWorks, Inc.
//
// Registration is the app's call, not a side effect of importing a widget. Each widget module
// exports a define function that registers the parts its template renders under their default
// names, then the widget itself under a name the app may choose; every one of them ends here.
//
// A name some other class already holds is an error, never a reuse: another library on the page
// may own the same tag (another data explorer app defines several of these names itself), and
// taking its element for ours would render something else where a widget was asked for, quietly.
// Asking again for the same class under the same name is a no-op, so two widgets that share a
// part can both define it.
//
// The platform adds one rule of its own: a class takes one name per registry, so the same widget
// under a second name throws from customElements.define. An app wanting that subclasses it.
export function defineElement(tag, cls) {
    const existing = customElements.get(tag);
    if (existing === cls)
        return;
    if (existing) {
        throw new Error(`<${tag}> is already defined as ${nameOf(existing)}; it cannot also be ${nameOf(cls)}`);
    }
    customElements.define(tag, cls);
}
function nameOf(cls) {
    return cls.name || 'an anonymous class';
}
