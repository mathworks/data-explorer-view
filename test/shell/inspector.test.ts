// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The Properties view, connected: it follows the active tab's table with the pages a shell asks for
// (the file's own page while no row is selected, a section heading's, "N selected", a row's Usage
// links), and its rows are editable where the document takes an edit, each change written back as a
// cell edit is (the table shows it, the tab is unsaved, a refusal is the table's dialog). At Root, a
// box clicked in the relationship graph shows its file's page, and the location bar a dimmed
// "Root › file" for it, which opens the file when pressed; a click on the graph's background clears
// both.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DexPropertyInspector } from '../../src/widgets/property-inspector/dex-property-inspector.js';
import { onMac } from '../../src/widgets/app-shell/connect/keys.js';
import {
  activeTab,
  dirtyTabs,
  errorDialog,
  graph,
  inspectorNote,
  locationBar,
  open,
  previewTabs,
  rowOf,
  savedTo,
  sectionOf,
  selectRow,
  settled,
  startPage,
  tabNamed,
  tabNames,
  tableOf,
  textOf,
  until,
  valueIn,
} from './harness.js';

afterEach(() => void vi.restoreAllMocks());

const FILES = { 'params.sldd': 'params.sldd', 'shadow_ws.slx': 'shadow_ws.slx' };
const inspector = () => document.querySelector<DexPropertyInspector>('dex-property-inspector')!;
/** The inspector's rows, as `name: value`, of the group titled `title` (the first for none). */
const rows = (title?: string) => {
  const group = title === undefined ? inspector().groups[0] : inspector().groups.find((g) => g.title === title);
  return (group?.properties ?? []).map((p) => `${p.name}: ${p.value}`);
};
const titles = () => inspector().groups.map((g) => g.title);
/** The field of the inspector's row `name`, as drawn now. */
const fieldNow = (name: string) =>
  [...(inspector().shadowRoot?.querySelectorAll('.prop-row') ?? [])]
    .find((r) => r.querySelector('.prop-name')?.textContent === name)
    ?.querySelector<HTMLInputElement>('.prop-input') ?? undefined;
/** The field of the inspector's row `name`, once it is drawn. */
async function fieldOf(name: string): Promise<HTMLInputElement> {
  await until(() => !!fieldNow(name));
  return fieldNow(name)!;
}
/** Click the link of the inspector's row `name`. */
function clickLink(name: string): void {
  const link = [...(inspector().shadowRoot?.querySelectorAll<HTMLAnchorElement>('.prop-link') ?? [])].find((a) => a.textContent === name);
  expect(link, `no link ${name}`).toBeTruthy();
  link!.click();
}
const root = () => document.querySelector('dex-explorer')!.dispatchEvent(new CustomEvent('dex-explorer-open', { detail: { fileId: null, pin: false }, bubbles: true, composed: true }));
const go = (to: number) => locationBar().dispatchEvent(new CustomEvent('dex-location-go', { detail: { to }, bubbles: true, composed: true }));
/** Click `id` in the graph (a box or an item), or its background for null, as the element reports it. */
function graphClick(id: string | null): void {
  graph().selected = id;
  graph().dispatchEvent(new CustomEvent('dex-graph-selected', { detail: { id }, bubbles: true, composed: true }));
}
const segments = () => locationBar().segments.map((s) => `${s.label}${s.preview ? ' (preview)' : ''}`);

describe('the Properties view, beside a tab', () => {
  it("shows the file's page while no row is selected, a section's, and how many rows are selected", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await until(() => rows().includes('Name: params.sldd'));
    expect(rows()).toContain('Kind: Data dictionary');
    expect(rows()).toContain('File: /work/params.sldd');
    expect(inspectorNote().hidden).toBe(true);
    const design = await sectionOf('params.sldd', 'Design Data');
    const table = tableOf('params.sldd')!;
    table.selectedRowIds = [design.ID];
    table.dispatchEvent(new CustomEvent('dex-row-selected', { detail: { rowIds: [design.ID] }, bubbles: true, composed: true }));
    await until(() => titles().join() === 'General,Entry Types');
    expect(rows('Entry Types')).toEqual(['double: 3']);
    const kp = await rowOf('params.sldd', 'Kp');
    const uo = await rowOf('params.sldd', 'Uo');
    table.selectedRowIds = [kp.ID, uo.ID];
    table.dispatchEvent(new CustomEvent('dex-row-selected', { detail: { rowIds: [kp.ID, uo.ID] }, bubbles: true, composed: true }));
    await until(() => titles().join() === '2 selected');
  });

  it('edits a row as its cell is edited: the table shows it, the tab is unsaved, the page says so until it is saved', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await selectRow('params.sldd', 'Kp');
    const value = await fieldOf('Value');
    value.value = '5';
    value.dispatchEvent(new Event('change'));
    await until(() => textOf(tableOf('params.sldd')!.rows.find((r) => r.Name.label === 'Kp')) === '5');
    await until(() => dirtyTabs().join() === 'params.sldd');
    // The file itself, by its segment: its page says it holds an edit, and no longer once saved.
    go(1);
    await until(() => rows().includes('Modified: Yes'));
    page.command('save');
    await until(() => rows().includes('Modified: No'));
  });

  it('keeps what is typed in the next field while the change of one is written and its page sent again', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await selectRow('params.sldd', 'Kp');
    const value = await fieldOf('Value');
    value.value = '5';
    value.dispatchEvent(new Event('input'));
    value.dispatchEvent(new Event('change'));
    const name = await fieldOf('Name');
    name.focus();
    name.value = 'Kq';
    name.dispatchEvent(new Event('input'));
    await until(() => dirtyTabs().join() === 'params.sldd');
    await until(() => inspector().groups[0]!.properties.find((p) => p.name === 'Value')?.value === '5');
    await settled();
    expect(fieldNow('Name')!.value).toBe('Kq');
  });

  it('writes what is typed to its row when the selection moves on with the focus still in the field', async () => {
    // A move with no blur: Back from a native menu, a command, a link. The text is Kp's, and Uo's
    // field shows Uo's value.
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await selectRow('params.sldd', 'Kp');
    const value = await fieldOf('Value');
    value.focus();
    value.value = '123';
    value.dispatchEvent(new Event('input'));
    const uo = await selectRow('params.sldd', 'Uo');
    await until(() => textOf(tableOf('params.sldd')!.rows.find((r) => r.Name.label === 'Kp')) === '123');
    await until(() => rows().includes('Name: Uo'));
    await settled();
    expect(fieldNow('Value')!.value).toBe(textOf(uo));
    expect(textOf(tableOf('params.sldd')!.rows.find((r) => r.Name.label === 'Uo'))).toBe(textOf(uo));
  });

  it('saves what is typed in a field with Mod+S, the focus still in it', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await selectRow('params.sldd', 'Kp');
    const value = await fieldOf('Value');
    value.focus();
    value.value = '8';
    value.dispatchEvent(new Event('input'));
    const mod = onMac() ? { metaKey: true } : { ctrlKey: true };
    value.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ...mod, bubbles: true, composed: true, cancelable: true }));
    await until(() => !!savedTo(page.main, 'params.sldd'));
    expect(await valueIn(savedTo(page.main, 'params.sldd')!, 'params.sldd', 'Kp')).toBe('8');
    await settled();
    expect(dirtyTabs()).toEqual([]);
  });

  it('says why a change is refused, in the dialog the table uses, and puts the field back', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await selectRow('params.sldd', 'Kp');
    const name = await fieldOf('Name');
    name.value = '1 bad';
    name.dispatchEvent(new Event('change'));
    await until(() => errorDialog().hasAttribute('open'));
    expect(errorDialog().shadowRoot?.textContent).toContain('Invalid Value');
    await until(() => fieldNow('Name')?.value === 'Kp');
    expect(dirtyTabs()).toEqual([]);
  });

  it("opens a file its page references, by its link, as a link to it would", async () => {
    const page = startPage(FILES);
    await open(page, 'shadow_ws.slx');
    await until(() => rows('References').join() === 'params.sldd: Not open');
    clickLink('params.sldd');
    await until(() => previewTabs().join() === 'params.sldd');
    // Open now: the model's page says so.
    await until(() => !!tabNamed('shadow_ws.slx'));
    tabNamed('shadow_ws.slx')!.click();
    await until(() => rows('References').join() === 'params.sldd: Open');
  });

  it("says where the file is in the host's words, beside its tab and at Root, where the host has words for its paths", async () => {
    // A browser host's paths are its own making (/files/4/params.sldd): the File row says what the
    // path means to the user, as the tab's tooltip does.
    const page = startPage(FILES);
    page.host.pathTitle = (path) => `plant${path.slice(path.lastIndexOf('/'))}`;
    await open(page, 'params.sldd', 'shadow_ws.slx');
    await until(() => rows().includes('Name: shadow_ws.slx'));
    expect(rows()).toContain('File: plant/shadow_ws.slx');
    root();
    await until(() => (graph().graph?.boxes.length ?? 0) === 2);
    graphClick(graph().graph!.boxes.find((b) => b.label === 'params.sldd')!.id);
    await until(() => rows().includes('Name: params.sldd'));
    expect(rows()).toContain('File: plant/params.sldd');
  });

  it("lists a row's Usage links, and goes where one points", async () => {
    const page = startPage(FILES);
    await open(page, 'shadow_ws.slx', 'params.sldd');
    tabNamed('shadow_ws.slx')!.click();
    await until(() => activeTab() === tabNamed('shadow_ws.slx'));
    await selectRow('shadow_ws.slx', 'Kp');
    // The open tabs' usage fills the cell (no folder is shown): the block, as the table's Usage cell
    // names it. It is at the top of the model whose workspace holds Kp, so nothing more is said of
    // where it is (its path is its name; the model is the tab's own).
    await until(() => rows('Used By').join() === 'WsGain: ');
    // What the table's own cell for it reads.
    const kp = await rowOf('shadow_ws.slx', 'Kp');
    const cell = tableOf('shadow_ws.slx')!.shadowRoot!.querySelector(`tr[data-row-id="${CSS.escape(kp.ID)}"] td.col-UsedBy`);
    expect(cell?.textContent?.trim()).toBe('WsGain');
    clickLink('WsGain');
    const block = await rowOf('shadow_ws.slx', 'WsGain');
    await until(() => tableOf('shadow_ws.slx')!.selectedRowIds.join() === block.ID);
  });
});

describe('the Properties view at Root', () => {
  async function atRoot() {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'shadow_ws.slx');
    root();
    await until(() => (graph().graph?.boxes.length ?? 0) === 2);
    const box = (label: string) => graph().graph!.boxes.find((b) => b.label === label)!;
    return { page, box };
  }

  it("shows the page of a box clicked in the graph, and a dimmed Root › file; the background clears both", async () => {
    const { box } = await atRoot();
    expect(inspectorNote().hidden).toBe(false);
    expect(segments()).toEqual(['Root']);
    graphClick(box('params.sldd').id);
    await until(() => rows().includes('Name: params.sldd'));
    expect(rows('Referenced By')).toEqual(['shadow_ws.slx: Open']);
    await until(() => segments().join() === 'Root,params.sldd (preview)');
    expect(locationBar().segments[1]!.description).toBe('selected in the graph');
    // An item's box, for an item.
    graphClick(box('shadow_ws.slx').items[0]!.id);
    await until(() => rows().includes('Name: shadow_ws.slx'));
    graphClick(null);
    await until(() => inspectorNote().hidden === false);
    await until(() => segments().join() === 'Root');
  });

  it('opens the file of the dimmed segment when it is pressed, and a file its page links', async () => {
    const { box } = await atRoot();
    graphClick(box('params.sldd').id);
    await until(() => segments().length === 2);
    go(1);
    await until(() => activeTab() === tabNamed('params.sldd'));
    root();
    await until(() => segments().join() === 'Root,params.sldd (preview)');
    clickLink('shadow_ws.slx');
    await until(() => activeTab() === tabNamed('shadow_ws.slx'));
    expect(tabNames()).toEqual(['params.sldd', 'shadow_ws.slx']);
  });

  it("shows the row a tab's selection holds again when Back comes back to the tab from Root", async () => {
    // The tab's table has its selection all along; the inspector, following none at Root, follows
    // it again, and Back selects the same row once more, which is no new page to send.
    const page = startPage(FILES);
    await open(page, 'shadow_ws.slx', 'params.sldd');
    await selectRow('params.sldd', 'Kp');
    await until(() => rows().includes('Name: Kp'));
    page.command('show-graph');
    await until(() => inspectorNote().hidden === false);
    page.command('back');
    await until(() => activeTab() === tabNamed('params.sldd'));
    await until(() => rows().includes('Name: Kp'));
    expect(inspectorNote().hidden).toBe(true);
  });

  it("follows the active tab again when one is shown, and the graph's selection back at Root", async () => {
    const { box } = await atRoot();
    graphClick(box('shadow_ws.slx').id);
    await until(() => rows().includes('Name: shadow_ws.slx'));
    tabNamed('params.sldd')!.click();
    await until(() => rows().includes('Name: params.sldd'));
    expect(segments()).toEqual(['Root', 'params.sldd']);
    root();
    await until(() => rows().includes('Name: shadow_ws.slx'));
    await settled();
    expect(segments()).toEqual(['Root', 'shadow_ws.slx (preview)']);
  });
});
