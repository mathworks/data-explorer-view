// Copyright 2026 The MathWorks, Inc.
//
// The shell's in-page questions, for a host with no prompts of its own (a browser page): "Save
// changes?" and "x changed on disk", asked in the one `<dex-confirm-dialog>`, one at a time, and
// the line of text Open from URL… asks for (the dialog's prompt), in the same turn.
//
// The dialog's show() answers a question still open with that question's cancel when it is asked
// another. Asked as they came, a reload question would cancel a "Save changes?" under it, and a close
// would answer a reload question Keep My Edits, with nobody having pressed anything. So each waits
// for the one before it to be answered. One that is no longer worth asking (`still`: its tab has
// closed) is answered with its cancel: unasked, if that is so by its turn; taken down, when its tab
// closes while it is up, which the answer before it may just have done (a "Don't Save" that closed
// the tab a reload question was waiting about).
import { reloadQuestion } from './reload.js';
import { closeAnswerOf, closeQuestion } from './saving.js';
/** Questions asked in `dialog`; `beforeAsking` runs as each is shown (the shell closes its popovers then). */
export function inPageQuestions(dialog, beforeAsking) {
    let queue = Promise.resolve();
    let shownStill = null;
    return {
        ask(question, still = () => true) {
            const answer = queue.then(async () => {
                if (!still())
                    return question.cancelId;
                beforeAsking();
                shownStill = still;
                try {
                    return await dialog.show(question);
                }
                finally {
                    shownStill = null;
                }
            });
            queue = answer.catch(() => undefined);
            return answer;
        },
        // In the same turn as the questions: the dialog answers whatever is up when it is asked another.
        // Asked for by the user, so worth asking whatever closes meanwhile.
        prompt(options) {
            const answer = queue.then(() => {
                beforeAsking();
                return dialog.prompt(options);
            });
            queue = answer.catch(() => undefined);
            return answer;
        },
        recheck() {
            if (shownStill && !shownStill())
                dialog.close();
        },
    };
}
/**
 * The shell's two questions: the host's own where it has them (a native dialog), the in-page ones
 * where it has none. The answer to a reload question is said in the Log (`log`): reloaded, the
 * edits are gone; kept, the next save writes over the other program's change, which is worth a
 * warning. A reload question that waits its turn is dropped for a tab no longer `open`.
 */
export function shellPrompts(host, questions, options) {
    return {
        confirmClose: (names) => (host.confirmClose ? host.confirmClose(names) : questions.ask(closeQuestion(names)).then(closeAnswerOf)),
        confirmReload: (tab) => (host.confirmReload
            ? host.confirmReload(tab.name)
            : questions.ask(reloadQuestion(tab.name), () => options.open(tab)).then((id) => id === 'reload')).then((reload) => {
            if (reload)
                options.log('info', `${tab.name} changed on disk: reloaded, its unsaved edits dropped`);
            else
                options.log('warning', `${tab.name} changed on disk: its unsaved edits kept over the change`);
            return reload;
        }),
    };
}
