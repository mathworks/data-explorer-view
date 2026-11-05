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
| `acs_sets.slx` | `test/fixtures/active-config/acs_sets.slx` | `test/parity/matlab/gen_active_config.m` (R2027a): three configuration sets, Configuration active |
| `acs_sets_R2013b.slx` | `test/fixtures/active-config/acs_sets_R2013b.slx` | the same, exported to R2013b: the sets inline in the block diagram |
| `acs_ref.slx` | `test/fixtures/active-config/acs_ref.slx` | `gen_active_config.m`: a set and a `Simulink.ConfigSetRef` into a dictionary |
| `pd.sldd` | `test/fixtures/config-set-paste/pd.sldd` | `test/parity/matlab/gen_config_set_paste.m` (R2027a): a text dictionary holding Fast (fixed-step, StopTime 2) and R, a reference |
