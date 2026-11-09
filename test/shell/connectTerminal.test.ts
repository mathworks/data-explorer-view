// Copyright 2026 The MathWorks, Inc.
//
// connectTerminal (connect/terminal.ts) taken down while its lines still run, over a stand-in
// window and tab: what the page tests cannot hold still. A line whose answer lands after dispose()
// shows nothing; a line queued behind it is never run, its document never asked; and a line sent
// after dispose is not heard at all.
import { describe, expect, it, vi } from 'vitest';
import type { RawView } from '../../src/model/raw/rawView.js';
import type { OpenTab } from '../../src/widgets/app-shell/connect/documents.js';
import { connectTerminal } from '../../src/widgets/app-shell/connect/terminal.js';
import type { DexCommandWindow } from '../../src/widgets/app-shell/modules/dex-command-window.js';

/** A tab whose document's raw answers wait for the test, and what it was asked. */
function heldTab() {
  const asked: { rowId: string; answer: (view: RawView) => void }[] = [];
  const raw = vi.fn((rowId: string) => new Promise<RawView>((answer) => asked.push({ rowId, answer })));
  const rows = [{ ID: 'e:Kp', parent: null, Name: { label: 'Kp' } }];
  const tab = { id: 't', name: 'params.sldd', path: '/w/params.sldd', doc: { kind: 'dictionary', table: { raw } }, table: { rows } } as unknown as OpenTab;
  return { tab, asked, raw };
}

function setUp() {
  const held = heldTab();
  const window = Object.assign(new EventTarget(), { appendOutput: vi.fn() }) as unknown as DexCommandWindow & { appendOutput: ReturnType<typeof vi.fn> };
  const terminal = connectTerminal(window, { active: () => held.tab, tabs: () => [held.tab], save: async () => 'Saved.' });
  const run = (line: string) => window.dispatchEvent(new CustomEvent('dex-command-run', { detail: { line } }));
  return { ...held, window, terminal, run };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('connectTerminal, disposed', () => {
  it('shows no answer that lands after dispose, and runs no line queued behind it', async () => {
    const { window, terminal, run, asked, raw } = setUp();
    run('json Kp');
    run('json Kp');
    await vi.waitFor(() => expect(asked).toHaveLength(1));
    terminal.dispose();
    asked[0]!.answer({ format: 'json', text: '{"Kp": 1}' });
    await terminal.idle();
    await tick();
    expect(window.appendOutput).not.toHaveBeenCalled();
    expect(raw).toHaveBeenCalledTimes(1);
  });

  it('hears no line sent after dispose', async () => {
    const { terminal, run, raw } = setUp();
    terminal.dispose();
    run('json Kp');
    await terminal.idle();
    expect(raw).not.toHaveBeenCalled();
  });

  it('answers while it is up', async () => {
    const { window, terminal, run, asked } = setUp();
    run('json Kp');
    await vi.waitFor(() => expect(asked).toHaveLength(1));
    asked[0]!.answer({ format: 'json', text: '{"Kp": 1}' });
    await terminal.idle();
    expect(window.appendOutput).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(window.appendOutput.mock.calls[0]![0])).toContain('Kp');
  });
});
