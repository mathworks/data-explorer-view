// Copyright 2026 The MathWorks, Inc.
//
// What the shell makes of a MATLAB its host reaches (src/widgets/app-shell/connect/matlab.ts), the
// pure part: what the status bar says of each status. A MATLAB busy running something answers
// once it is done, which the bar says rather than leave the user to think the link is gone.
import { describe, expect, it } from 'vitest';
import { matlabLabel } from '../../src/widgets/app-shell/connect/matlab.js';
import { CONNECTED } from './matlabHost.js';

describe('matlabLabel', () => {
  it('says nothing with no MATLAB, or none connected', () => {
    expect(matlabLabel(undefined)).toEqual({ label: '', title: '' });
    expect(matlabLabel({ state: 'off' })).toEqual({ label: '', title: '' });
  });

  it('names the MATLAB connected, and its process in the tooltip', () => {
    expect(matlabLabel({ ...CONNECTED, pid: 47857 })).toEqual({ label: 'MATLAB R2027a', title: 'Connected to MATLAB R2027a (process 47857)' });
  });

  it('says when it is busy, and that it answers once it is done', () => {
    expect(matlabLabel({ ...CONNECTED, busy: true })).toEqual({
      label: 'MATLAB R2027a (busy)',
      title: 'MATLAB R2027a is running something and answers once it is done',
    });
  });
});
