// Copyright 2026 The MathWorks, Inc.
//
// The facts a Managed Simulink Project adds to a MATLAB Project, as they travel to the
// project page.
//
// PROOF OF CONCEPT, and deliberately additive. MSP is an unshipped toolkit, so every
// field here arrives through ONE optional key on `setProject`: a project that is not an
// MSP carries no `msp`, and the page then renders exactly the markup it rendered
// before. Nothing in this file can change how an ordinary MATLAB Project is presented.
//
// If it ships, this projection belongs in core beside ProjectPage.ts — it is derived
// from the parse, and every host should derive it the same way. It lives here for now
// because core is public and this toolkit is not.
//
// The two words this exists to teach:
//   INTERFACE  the half of a project other projects can see. `<Name>_Interface.sldd`
//              holds TYPES (buses, alias and numeric types, enums), and referencing a
//              project chains its interface dictionary into yours.
//   COMPONENT  a referenced MSP project. The toolkit's own word — `msp.getStatus`
//              reports `components` as "table of referenced MSP projects" — so it is a
//              project-level noun, not a subsystem or a Model block.
/** English for a role, for the page's identity line. */
export const MSP_ROLE_LABEL = {
    component: 'component',
    common: 'shared interface',
};
