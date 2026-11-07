// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell with a MATLAB its host reaches (ShellHost.matlab), connected: the status bar names the
// MATLAB connected, and goes back to saying nothing when it goes; its button, the palette's
// Connect to MATLAB… and the `matlab-connect` command show the host's way to connect. A host with
// no MATLAB (the browser host, the VS Code extension) shows none of it anywhere. The MATLAB is
// test/shell/matlabHost.ts's fake: no MATLAB runs.
import { describe, expect, it } from 'vitest';
import type { PaletteCommand } from '../../src/widgets/app-shell/modules/dex-command-palette.js';
import type { DexShellStatus } from '../../src/widgets/app-shell/connect/dex-shell-status.js';
import { CONNECTED, fakeMatlab, type FakeMatlab } from './matlabHost.js';
import { palette, startPage, until, type Page } from './harness.js';

const status = () => document.querySelector<DexShellStatus>('dex-shell-status[slot="status"]')!;
/** The status bar's MATLAB button, once the bar has drawn what it was last given. */
async function matlabButton(): Promise<HTMLButtonElement | null> {
  await status().updateComplete;
  return status().shadowRoot!.querySelector<HTMLButtonElement>('button.matlab');
}

/** The palette's rows as the `palette` command shows them. */
function paletteRows(page: Page): PaletteCommand[] {
  let shown: PaletteCommand[] = [];
  const show = palette().show.bind(palette());
  palette().show = (commands) => ((shown = commands), show(commands));
  page.command('palette');
  palette().show = show;
  palette().close();
  return shown;
}
const matlabRows = (page: Page) => paletteRows(page).filter((c) => c.category === 'MATLAB');
const run = (id: string) => palette().dispatchEvent(new CustomEvent('dex-palette-run', { detail: { id }, bubbles: true, composed: true }));
const connects = (matlab: FakeMatlab) => matlab.calls.filter((c) => c.name === 'showConnect').length;

describe('a shell host with no MATLAB', () => {
  it('shows no MATLAB in the status bar or the palette', async () => {
    const page = startPage();
    expect(await matlabButton()).toBeNull();
    expect(paletteRows(page).length).toBeGreaterThan(0);
    expect(matlabRows(page)).toEqual([]);
  });
});

describe('a shell host with a MATLAB', () => {
  it('shows no button while none is connected, and offers Connect to MATLAB… in the palette', async () => {
    const matlab = fakeMatlab({ state: 'off' });
    const page = startPage({}, { host: { matlab } });
    expect(await matlabButton()).toBeNull();
    expect(matlabRows(page).map((c) => [c.id, c.label])).toEqual([['matlab-connect', 'Connect to MATLAB…']]);
    page.command('palette');
    run('matlab-connect');
    expect(connects(matlab)).toBe(1);
  });

  it('names the MATLAB connected in the status bar, says when it is busy, and says nothing once it goes', async () => {
    const matlab = fakeMatlab({ state: 'off' });
    startPage({}, { host: { matlab } });
    matlab.set(CONNECTED);
    await until(() => status().matlab !== '');
    const button = (await matlabButton())!;
    expect(button.textContent?.trim()).toBe('MATLAB R2027a');
    expect(button.title).toBe('Connected to MATLAB R2027a (process 4242)');
    matlab.set({ ...CONNECTED, busy: true });
    expect((await matlabButton())!.textContent?.trim()).toBe('MATLAB R2027a (busy)');
    matlab.set({ state: 'off' });
    expect(await matlabButton()).toBeNull();
  });

  it('draws a MATLAB connected before the shell was, as it connects', async () => {
    startPage({}, { host: { matlab: fakeMatlab(CONNECTED) } });
    expect((await matlabButton())?.textContent?.trim()).toBe('MATLAB R2027a');
  });

  it("shows the host's Connect to MATLAB on a press of the button, and on the matlab-connect command", async () => {
    const matlab = fakeMatlab(CONNECTED);
    const page = startPage({}, { host: { matlab } });
    (await matlabButton())!.click();
    expect(connects(matlab)).toBe(1);
    page.command('matlab-connect');
    expect(connects(matlab)).toBe(2);
  });

  it('listens to the MATLAB once, and stops once the shell is disposed', async () => {
    const matlab = fakeMatlab({ state: 'off' });
    const subscribed: string[] = [];
    const on = matlab.on.bind(matlab);
    matlab.on = (listener) => {
      subscribed.push('on');
      const off = on(listener);
      return () => (subscribed.push('off'), off());
    };
    const page = startPage({}, { host: { matlab } });
    expect(subscribed).toEqual(['on']);
    page.handle.dispose();
    expect(subscribed).toEqual(['on', 'off']);
    expect(() => matlab.set(CONNECTED)).not.toThrow();
  });
});
