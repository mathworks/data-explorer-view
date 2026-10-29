# The widgets' conventions

What every widget of this package does the same way, so an app that knows one knows the rest, and
a new widget follows them. The tests hold each widget to them.

## Defining

Each widget has an entry of its own, which exports its class, its define function and the types
of what it takes and sends. `defineX(tag = 'dex-x')` registers the widget, and the parts it
draws, when the app asks; importing an entry registers nothing. A name already taken by another
class throws, naming both.

## Data in by properties

- Data (rows, groups, columns, payloads) is a property only, of plain data and never a core
  object: an array or an object has no attribute, so there is one way in and nothing is parsed.
- A setting a page might write in markup, a string, a number or a boolean (`readonly`, `label`,
  `storage-key`), has an attribute too, in dash-case: the property's name with a dash before
  each capital (`expandTopLevel` is `expand-top-level`).
- `@property` is public and documented; what a widget keeps to itself is `@state`.
- A widget that opens and closes does it with `show()` and `close()`.

## Actions out by events

Every user action is a `dex-*` `CustomEvent`, which bubbles and is composed (it leaves the
shadow root), with a typed `detail`. A widget declares its events in an event map of its own
(`TreeTableEventMap`), which `HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`
extend, so a listener on the element, the document or the window reads `e.detail` with no cast.
A widget never calls the app, and never finds another widget.

An event's name says what kind of event it is:

- **Something happened**, a notification: the past participle. `dex-row-selected`,
  `dex-filter-applied`, `dex-property-changed`, `dex-hierarchy-selected`, `dex-menu-closed`.
- **Do something**, a request the app answers: a verb, or `request`. `dex-project-open`,
  `dex-request-children`, `dex-edit-text-request`, `dex-add-entry`, `dex-revert`.

`dex-link-clicked` is older than the rule: a request named as a notification, kept for what it
would cost an app to move.

Its detail's type is the event's name without `dex-`, in PascalCase, and `Detail`:
`dex-row-selected` sends a `RowSelectedDetail`, `dex-property-navigate` a
`PropertyNavigateDetail`. An event with nothing to say sends `null`.

## Theming and icons

Colours, fonts and sizes are `--dex-*` tokens (`data-explorer-view/theme.css`), each read with
the light theme's value as its fallback, so a widget is readable on a page that loads no theme.
Icons are files, served from where `setIconBase` or `useIconAssets` says.

## Versioning

Semantic versioning, checked by `npm run check:api` against the last release (README,
"Developing"): a property, attribute, method or event gone, or renamed, is a major release.
