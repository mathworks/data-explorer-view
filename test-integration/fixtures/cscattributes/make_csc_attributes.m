function make_csc_attributes(outDir)
  % Copyright 2026 The MathWorks, Inc.
  % Authors csc_attributes_text.sldd and csc_attributes_binary.sldd: entries whose storage
  % class carries attributes (CoderInfo.CustomAttributes), which a property column the user
  % names in the table's Columns menu reads when the object has no top-level property of that
  % name. test/propertyCells.test.ts reads them (a folder of its own, so no folder golden lists them). Run:
  %
  %   matlab -batch "cd('<this folder>'); make_csc_attributes"
  %
  % (Verify by the WROTE lines, the ATTR lines MATLAB reads back, and the trailing
  % MAKE_CSC_ATTRIBUTES_DONE.) `outDir` defaults to this folder.
  %
  % Entries, in Design Data, the same in both files:
  %   (each a Custom storage class: StorageClass 'Custom' and its CustomStorageClass)
  %   pExport   Simulink.Parameter 5, ExportToFile: HeaderFile p_export.h, DefinitionFile p_export.c
  %   sGetSet   Simulink.Signal, GetSet: GetFunction get_s, SetFunction set_s, HeaderFile getset.h
  %   pStruct   Simulink.Parameter 2, Struct: StructName calib
  %   pAuto     Simulink.Parameter 1, Auto: no attributes
  %
  % USER is set to 'fixture' while the dictionaries are written (each entry's LastModBy).
  here = fileparts(mfilename('fullpath'));
  if nargin < 1 || isempty(outDir)
    outDir = here;
  end
  user = getenv('USER');
  setenv('USER', 'fixture');
  restoreUser = onCleanup(@() setenv('USER', user));

  pExport = Simulink.Parameter(5);
  pExport.CoderInfo.StorageClass = 'Custom';
  pExport.CoderInfo.CustomStorageClass = 'ExportToFile';
  pExport.CoderInfo.CustomAttributes.HeaderFile = 'p_export.h';
  pExport.CoderInfo.CustomAttributes.DefinitionFile = 'p_export.c';

  sGetSet = Simulink.Signal;
  sGetSet.CoderInfo.StorageClass = 'Custom';
  sGetSet.CoderInfo.CustomStorageClass = 'GetSet';
  sGetSet.CoderInfo.CustomAttributes.GetFunction = 'get_s';
  sGetSet.CoderInfo.CustomAttributes.SetFunction = 'set_s';
  sGetSet.CoderInfo.CustomAttributes.HeaderFile = 'getset.h';

  pStruct = Simulink.Parameter(2);
  pStruct.CoderInfo.StorageClass = 'Custom';
  pStruct.CoderInfo.CustomStorageClass = 'Struct';
  pStruct.CoderInfo.CustomAttributes.StructName = 'calib';

  pAuto = Simulink.Parameter(1);

  V = {'pExport', pExport; 'sGetSet', sGetSet; 'pStruct', pStruct; 'pAuto', pAuto};
  formats = {'uncompressed-text', 'csc_attributes_text.sldd'; 'compressed-binary', 'csc_attributes_binary.sldd'};
  for f = 1:size(formats, 1)
    p = fullfile(outDir, formats{f, 2});
    Simulink.data.dictionary.closeAll('-discard');
    if isfile(p)
      delete(p);
    end
    dd = Simulink.data.dictionary.create(p);
    dd.FileFormat = formats{f, 1};
    section = getSection(dd, 'Design Data');
    for i = 1:size(V, 1)
      addEntry(section, V{i, 1}, V{i, 2});
    end
    saveChanges(dd);
    close(dd);
    Simulink.data.dictionary.closeAll('-discard');
    fprintf('WROTE %s\n', p);
  end

  % What MATLAB reads back from the text file, attribute by attribute.
  dd = Simulink.data.dictionary.open(fullfile(outDir, formats{1, 2}));
  section = getSection(dd, 'Design Data');
  for i = 1:size(V, 1)
    obj = getValue(getEntry(section, V{i, 1}));
    attrs = obj.CoderInfo.CustomAttributes;
    names = properties(attrs);
    for k = 1:numel(names)
      value = attrs.(names{k});
      if ischar(value) || isstring(value)
        text = char(value);
      else
        text = mat2str(value);
      end
      fprintf('ATTR %s %s %s = %s\n', V{i, 1}, obj.CoderInfo.CustomStorageClass, names{k}, text);
    end
  end
  close(dd);
  Simulink.data.dictionary.closeAll('-discard');
  clear restoreUser;
  fprintf('MAKE_CSC_ATTRIBUTES_DONE\n');
end
