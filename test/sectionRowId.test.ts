// Copyright 2026 The MathWorks, Inc.

import { describe, it, expect } from 'vitest';
import {
  SECTION_ROW_PREFIX,
  buildSectionRowId,
  isEntryRow,
  isSectionRowId,
  sectionNameFromRowId,
} from '../src/model/ids/sectionRowId.js';

describe('sectionRowId', () => {
  describe('SECTION_ROW_PREFIX', () => {
    it('is the string "section:"', () => {
      expect(SECTION_ROW_PREFIX).toBe('section:');
    });
  });

  describe('buildSectionRowId', () => {
    it('prepends "section:" to the name', () => {
      expect(buildSectionRowId('design')).toBe('section:design');
    });

    it('works with empty name', () => {
      expect(buildSectionRowId('')).toBe('section:');
    });
  });

  describe('isSectionRowId', () => {
    it('returns true for a section row id', () => {
      expect(isSectionRowId('section:design')).toBe(true);
    });

    it('returns false for a plain name', () => {
      expect(isSectionRowId('design')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(isSectionRowId('')).toBe(false);
    });
  });

  describe('isEntryRow', () => {
    it("is a row under a section row, a section's entry", () => {
      expect(isEntryRow({ ID: 'e:Kp', parent: 'section:design' })).toBe(true);
    });

    it('is a top-level row that is no section row, in a table with none (a MAT-file variable)', () => {
      expect(isEntryRow({ ID: 'm:P', parent: null })).toBe(true);
    });

    it("is not a section's own row, nor a row nested under an entry", () => {
      expect(isEntryRow({ ID: 'section:design', parent: null })).toBe(false);
      expect(isEntryRow({ ID: 'e:Bus/Speed', parent: 'e:Bus' })).toBe(false);
    });
  });

  describe('sectionNameFromRowId', () => {
    it('extracts the name from a section row id', () => {
      expect(sectionNameFromRowId('section:arch')).toBe('arch');
    });

    it('returns empty string for "section:" (empty name is valid)', () => {
      expect(sectionNameFromRowId('section:')).toBe('');
    });

    it('returns null for a non-section id', () => {
      expect(sectionNameFromRowId('foo')).toBeNull();
    });

    it('round-trips with buildSectionRowId', () => {
      expect(sectionNameFromRowId(buildSectionRowId('x'))).toBe('x');
    });
  });
});
