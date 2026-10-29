// Copyright 2026 The MathWorks, Inc.
// The error dialog alone: an error with a detail line, and a refused edit that offers Revert.
import { defineErrorDialog, type DexErrorDialog } from 'data-explorer-view/error-dialog';
import { byId, logEvents, startPage } from '../shell';

startPage();
defineErrorDialog(); // <dex-error-dialog>

const dialog = byId<DexErrorDialog>('dialog');
logEvents(dialog, ['dex-revert'], byId('event-log'));

byId('show-error').addEventListener('click', () => {
  dialog.show({
    title: 'Could not open the file',
    reason: 'The file is not a data dictionary, or it is damaged.',
    detail: 'plant.sldd: no data dictionary part was found in the archive.',
  });
});

byId('show-refused').addEventListener('click', () => {
  dialog.show({
    title: 'Invalid Value',
    reason: 'The value must be a numeric array.',
    invalidValue: '[1 2; 3',
    validValue: '[1 2; 3 4]',
    showRevert: true,
  });
});
