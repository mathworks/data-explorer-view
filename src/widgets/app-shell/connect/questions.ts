// Copyright 2026 The MathWorks, Inc.
//
// The shell's in-page questions, for a host with no prompts of its own (a browser page): "Save
// changes?" and "x changed on disk", asked in the one `<dex-confirm-dialog>`, one at a time.
//
// The dialog's show() answers a question still open with that question's cancel when it is asked
// another. Asked as they came, a reload question would cancel a "Save changes?" under it, and a close
// would answer a reload question Keep My Edits, with nobody having pressed anything. So each waits
// for the one before it to be answered. One that is no longer worth asking (`still`: its tab has
// closed) is answered with its cancel: unasked, if that is so by its turn; taken down, when its tab
// closes while it is up, which the answer before it may just have done (a "Don't Save" that closed
// the tab a reload question was waiting about).

import type { ConfirmOptions, DexConfirmDialog } from '../dex-confirm-dialog.js';
import { reloadQuestion } from './reload.js';
import { closeAnswerOf, closeQuestion } from './saving.js';
import type { CloseAnswer, ShellHost } from './types.js';

/** The in-page questions, as connectShell asks them. */
export interface Questions {
  /** Ask `question` once the questions before it are answered, unless `still` says by then it need not be: its answer's id. */
  ask(question: ConfirmOptions, still?: () => boolean): Promise<string>;
  /** Something closed: the question up, if `still` now says it need not be asked, goes, answered with its cancel. */
  recheck(): void;
}

/** Questions asked in `dialog`; `beforeAsking` runs as each is shown (the shell closes its popovers then). */
export function inPageQuestions(dialog: DexConfirmDialog, beforeAsking: () => void): Questions {
  let queue: Promise<unknown> = Promise.resolve();
  let shownStill: (() => boolean) | null = null;
  return {
    ask(question, still = () => true) {
      const answer = queue.then(async () => {
        if (!still()) return question.cancelId;
        beforeAsking();
        shownStill = still;
        try {
          return await dialog.show(question);
        } finally {
          shownStill = null;
        }
      });
      queue = answer.catch(() => undefined);
      return answer;
    },
    recheck() {
      if (shownStill && !shownStill()) dialog.close();
    },
  };
}

/**
 * The shell's two questions: the host's own where it has them (a native dialog), the in-page ones
 * where it has none. The answer to a reload question is said in the Log (`log`): reloaded, the
 * edits are gone; kept, the next save writes over the other program's change, which is worth a
 * warning. A reload question that waits its turn is dropped for a tab no longer `open`.
 */
export function shellPrompts<T extends { name: string }>(
  host: ShellHost,
  questions: Questions,
  options: { open(tab: T): boolean; log(level: 'info' | 'warning', message: string): void },
): { confirmClose(names: string[]): Promise<CloseAnswer>; confirmReload(tab: T): Promise<boolean> } {
  return {
    confirmClose: (names) => (host.confirmClose ? host.confirmClose(names) : questions.ask(closeQuestion(names)).then(closeAnswerOf)),
    confirmReload: (tab) =>
      (host.confirmReload
        ? host.confirmReload(tab.name)
        : questions.ask(reloadQuestion(tab.name), () => options.open(tab)).then((id) => id === 'reload')
      ).then((reload) => {
        if (reload) options.log('info', `${tab.name} changed on disk: reloaded, its unsaved edits dropped`);
        else options.log('warning', `${tab.name} changed on disk: its unsaved edits kept over the change`);
        return reload;
      }),
  };
}
