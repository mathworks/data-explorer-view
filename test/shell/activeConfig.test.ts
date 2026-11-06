// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Set as Active Configuration, on a model's configuration set, in the shell: its menu leads with
// it where the set can be made active, greyed with the reason where it cannot; chosen, the tab
// holds an unsaved edit that Undo takes back, and Save writes the model with that set active. A
// reference's warning, the workspace's `notify`, comes as a toast. Ported from
// data-explorer-app's page test of the same name.
import { describe, expect, it } from 'vitest';
import { parseSlx } from 'data-explorer-core';
import { choose, dirtyTabs, menuOn, open, savedTo, startPage, tableOf, until } from './harness.js';

const activeIn = (bytes: Uint8Array) =>
  parseSlx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 'saved.slx')
    .configSets.filter((c) => c.active)
    .map((c) => c.name);
const iconOf = (name: string) => tableOf('slxcases.slx')!.rows.find((r) => r.parent === 'section:config' && r.Name?.label === name)?.Name?.iconId;
const toast = () => document.querySelector('dex-toast-host')?.shadowRoot?.querySelector<HTMLElement>('.toast');

describe("Set as Active Configuration on a model's configuration set", () => {
  it('leads the menu of a set made active, and is greyed, saying why, on the active one', async () => {
    const page = startPage({ 'slxcases.slx': 'slxcases.slx' });
    await open(page, 'slxcases.slx');
    const fast = await menuOn('slxcases.slx', 'Fast');
    expect(fast[0]).toEqual({ id: 'setActiveConfigSet', label: 'Set as Active Configuration', disabled: false });
    const active = await menuOn('slxcases.slx', 'Configuration');
    expect(active[0]).toMatchObject({ id: 'setActiveConfigSet', disabled: true });
    // A workspace variable's menu has no such item.
    expect((await menuOn('slxcases.slx', 'tau')).map((i) => i.id)).not.toContain('setActiveConfigSet');
  });

  it('a reference is made active too, and a toast says what that cannot check without MATLAB', async () => {
    const page = startPage({ 'acs_ref.slx': 'acs_ref.slx' });
    await open(page, 'acs_ref.slx');
    const warning =
      '"RefFromDict" refers to the configuration set "dictCfg" in the data dictionary "acs_dict.sldd". Without MATLAB this editor ' +
      'cannot check that the set is there: open the model in MATLAB to confirm.';
    expect((await menuOn('acs_ref.slx', 'RefFromDict'))[0]).toEqual({ id: 'setActiveConfigSet', label: 'Set as Active Configuration', disabled: false });
    choose('setActiveConfigSet');
    await until(() => !!toast() && dirtyTabs().includes('acs_ref.slx'));
    expect([toast()!.classList.contains('warning'), toast()!.querySelector('.message')!.textContent]).toEqual([true, warning]);
    page.command('save');
    await until(() => dirtyTabs().length === 0);
    expect(activeIn(savedTo(page.main, 'acs_ref.slx')!)).toEqual(['RefFromDict']);
  });

  it('chosen, the tab holds the edit, Undo takes it back, and Save writes the set active', async () => {
    const page = startPage({ 'slxcases.slx': 'slxcases.slx' });
    await open(page, 'slxcases.slx');
    await menuOn('slxcases.slx', 'Fast');
    choose('setActiveConfigSet');
    await until(() => iconOf('Fast') === 'check_settings' && dirtyTabs().includes('slxcases.slx'));
    page.command('undo');
    await until(() => iconOf('Configuration') === 'check_settings' && dirtyTabs().length === 0);
    page.command('redo');
    await until(() => iconOf('Fast') === 'check_settings' && dirtyTabs().length === 1);
    page.command('save');
    await until(() => dirtyTabs().length === 0);
    expect(activeIn(savedTo(page.main, 'slxcases.slx')!)).toEqual(['Fast']);
  });
});
