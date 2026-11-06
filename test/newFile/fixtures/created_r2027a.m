% Copyright 2026 The MathWorks, Inc.
%
% created_r2027a.sldd, beside this script: the dictionary MATLAB writes for a new one
% (Simulink.data.dictionary.create, then saveChanges), which test/newDictionary.test.ts holds the
% shell's New to, byte for byte. Given the paths of dictionaries view wrote (a New saved, with or
% without entries added in the page), it also opens each, reads every entry of its Design Data, adds
% one, saves it, and opens it again: that MATLAB takes what New makes. It saves into those files, so
% give it copies.
%
% Run, in this folder:
%   matlab -batch "created_r2027a"
%   matlab -batch "created_r2027a('/tmp/new.sldd', '/tmp/new_with_entries.sldd')"
function created_r2027a(varargin)
here = fileparts(mfilename('fullpath'));
Simulink.data.dictionary.closeAll('-discard');
made = fullfile(here, 'created_r2027a.sldd');
if isfile(made), delete(made); end
dd = Simulink.data.dictionary.create(made);
saveChanges(dd);
close(dd);
fprintf('WROTE %s (R%s)\n', made, version('-release'));
for k = 1:numel(varargin)
    file = varargin{k};
    dd = Simulink.data.dictionary.open(file);
    design = getSection(dd, 'Design Data');
    entries = find(design);
    names = arrayfun(@(e) e.Name, entries, 'UniformOutput', false);
    for n = 1:numel(entries)
        value = getValue(entries(n));
        fprintf('  %s: %s\n', names{n}, class(value));
    end
    fprintf('OPENED %s: %d entries\n', file, numel(entries));
    addEntry(design, 'checkAdded', Simulink.Parameter(3));
    saveChanges(dd);
    close(dd);
    dd = Simulink.data.dictionary.open(file);
    value = getValue(getEntry(getSection(dd, 'Design Data'), 'checkAdded'));
    assert(isa(value, 'Simulink.Parameter') && value.Value == 3);
    assert(numel(find(getSection(dd, 'Design Data'))) == numel(entries) + 1);
    close(dd);
    fprintf('REOPENED %s\n', file);
end
fprintf('CREATED_R2027A_OK\n');
end
