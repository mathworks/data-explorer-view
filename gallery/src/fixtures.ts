// Copyright 2026 The MathWorks, Inc.
// The files the pages show: small public fixtures of this repository's tests, one of each kind
// core reads. `?url` makes each one an asset of the build, fetched as bytes the way an app
// reads a file the user opened.
import numericJson from '../../test/fixtures/numeric_json.sldd?url';
import objectPropsBinary from '../../test/fixtures/object_props_binary.sldd?url';
import ndNumeric from '../../test/fixtures/nd_numeric.mat?url';
import sharedGain from '../../test/fixtures/shared_gain.slx?url';
import { labelled } from './shell';

export interface Fixture {
  /** What `?fixture=` names it by. */
  id: string;
  /** The file's name: core reads the kind of file from it. */
  name: string;
  label: string;
  url: string;
}

export const FIXTURES: readonly Fixture[] = [
  { id: 'sldd-text', name: 'numeric_json.sldd', label: 'Data dictionary (text)', url: numericJson },
  { id: 'sldd-zip', name: 'object_props_binary.sldd', label: 'Data dictionary (zip)', url: objectPropsBinary },
  { id: 'mat', name: 'nd_numeric.mat', label: 'MAT-file', url: ndNumeric },
  { id: 'slx', name: 'shared_gain.slx', label: 'Model (.slx)', url: sharedGain },
];

export function fixtureById(id: string | null): Fixture {
  return FIXTURES.find((f) => f.id === id) ?? FIXTURES[0];
}

/** The fixture `?fixture=` names, or the first. */
export function askedFixture(): Fixture {
  return fixtureById(new URLSearchParams(location.search).get('fixture'));
}

/** A labelled <select> of the fixtures, on `fixture`. */
export function fixturePicker(fixture: Fixture, onPick: (f: Fixture) => void): HTMLElement {
  const select = document.createElement('select');
  for (const f of FIXTURES) select.append(new Option(`${f.label}: ${f.name}`, f.id, false, f === fixture));
  select.addEventListener('change', () => onPick(fixtureById(select.value)));
  return labelled('File', 'fixture', select);
}
