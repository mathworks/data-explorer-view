The files the app shell's page tests (`test/shell/`) open, copied from ww-mw/data-explorer-app's
`test/fixtures/` at 0983920, whose page tests these are ports of. That app had them from
mathworks/data-explorer-vscode (`test/fixtures/`, `test/fixtures/mcos/ParamMat.mat`) and
mathworks/data-explorer-core (`test/fixtures/mat-check/`, `test/parity/artifacts/slx_layouts/`,
`test/fixtures/active-config/`).

| File | Format | Used for |
|---|---|---|
| `params.sldd` | JSON dictionary | rows, edits, saves, file watching |
| `rt_bin.sldd` | compressed (zip) dictionary | rows, edits, a row pasted in |
| `shared_gain.slx` | model, made by hand (no OPC parts named) | a model that opens for viewing only |
| `slxcases.slx` | model written by MATLAB | a model whose Model Workspace takes edits; configuration sets |
| `acs_ref.slx` | model written by MATLAB: a configuration set and a `Simulink.ConfigSetRef` | a reference made active, with a warning |
| `legacy_ctrl.mdl` | model (text) | a model that takes no edits |
| `ParamMat.mat` | MAT-file, a 2x3 `Simulink.Parameter` | edits, saves, file watching |
| `viewing_only.mat` | MAT-file laid out in a way a save could not keep | a MAT-file that opens for viewing only |
| `shadow_ws.slx` | model whose blocks and data source link to `params.sldd` | links into another file |

This file is also what the tests open as a dictionary core cannot read.

They live here, beside the tests, and not in `test/fixtures/`: the golden tests read that folder
whole as a workspace (`test/goldens/hierarchy.test.ts`, `usage.test.ts`), and files added there
change the trees and the Usage they pin.
