<!-- Copyright 2026 The MathWorks, Inc. -->

# Model workspace fixtures

MATLAB-written `.slx` models, copied from data-explorer-core, for the tests of a model's Model
Workspace edited in view (test/modelEngine/model.test.ts). Each is core's own fixture, written by the generator
named:

| File | In core | Written by |
|---|---|---|
| `cases.slx` | `test/parity/artifacts/slx/cases.slx` | `test/parity/matlab/gen_truth.m` (R2027a): 73 workspace variables of every class |
| `slxcases.slx` | `test/parity/artifacts/slx_layouts/slxcases.slx` | `test/parity/matlab/gen_slx.m` (R2027a): blocks that use `tau`, `span` and `inner` |
| `slxcases_R2018a.slx` | `test/parity/artifacts/slx_layouts/slxcases_R2018a.slx` | the same, exported to R2018a: the workspace a whole MAT-file |
| `slxcfgref.slx` | `test/parity/artifacts/slx_layouts/slxcfgref.slx` | `gen_slx.m`: a model with no workspace variables |
| `wsf_matfile.slx` | `test/fixtures/workspace-facts/wsf_matfile.slx` | `test/parity/matlab/gen_workspace_facts.m`: a workspace loaded from a MAT-file |
| `wsf_plainarg.slx` | `test/fixtures/workspace-facts/wsf_plainarg.slx` | `gen_workspace_facts.m`: `k` and `gain` the model's arguments |
