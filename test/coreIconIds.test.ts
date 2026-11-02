// Copyright 2026 The MathWorks, Inc.
//
// THE ICON IDS CORE'S NODES ARE KNOWN TO ANSWER WITH, BY NAME.
//
// iconSet.test.ts checks that every id core's nodes can answer with ships in icons/, and reads
// those ids out of core's dist (tools/coreIcons.ts), so a class added to core is checked the day
// it lands. A scan has a weakness a list does not: it can lose an id without failing. Its floors
// catch a scan that finds nothing, but not one that finds one id fewer — renaming OBJECT_ICON,
// which the scan reads by its name, would drop `ws3d` unnoticed. These are the ids a row is known
// to draw, so each is pinned here: the scan has to see it, and icons/ has to ship it.
import { describe, it, expect } from 'vitest';
import { coreIconIds } from './tools/coreIcons.js';
import { shippedIcon } from './tools/shippedIcons.js';

const PINNED = [
  // A file's own icon, and External Data.
  'simulink', // a model (.slx)
  'simulink_database', // a JSON .sldd
  'simulink_server', // an XML .sldd
  'matlabWorkspaceFile', // a MAT-file
  'link_database', // External Data
  // A dictionary's sections.
  'databaseFolderDesign',
  'databaseFolderArchitecture',
  'databaseFolderConfiguration',
  'databaseFolder',
  // A model's sections and entries.
  'blocks', // Model Elements
  'block', // a block
  'databaseFolderWorkspace',
  'modelReference', // Model References, and each reference
  'simulinkDataDictionary_FT', // a .sldd data source
  'simulinkModel_FT', // a .slx data source
  // Entries whose ids only node getters name.
  'ws3d', // an object whose class has no icon of its own (core's OBJECT_ICON)
  'wsBusElement', // a Design Data Simulink.Bus element
  'typeBusElement', // an Architectural Data DataInterface element
  'typeStructElement', // a StructType element
  'wsConnectionElement', // a Design Data Simulink.ConnectionBus element
  'typeConnectionElement', // an Architectural Data PhysicalInterface element
  'wsElement', // a Design Data enum's current item
  'typeElement', // an Architectural Data enum's current item
  'busElement', // an enum item that is not current
  'variantSettings', // Simulink.VariantConfigurationData
  'twoConnected_wsDefault', // Simulink.VariantControl
  'variant_wsParameters', // Simulink.VariantVariable
];

describe("the ids core's nodes are known to answer with", () => {
  const { ids } = coreIconIds();

  it.each(PINNED)("%s: core's scan sees it, and icons/ ships it", (id) => {
    expect(ids.has(id), `the scan of core's dist no longer finds ${id}`).toBe(true);
    expect(shippedIcon(id), `${id}.svg is not in icons/`).toBeDefined();
  });
});
