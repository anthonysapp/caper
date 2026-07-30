import { describe, expect, it } from 'vitest';
import { findExportedConstants, parse } from './ast.mjs';

const constantsOf = (src) => findExportedConstants(parse(src));

describe('findExportedConstants', () => {
  it('reads plain exported constants', () => {
    expect(constantsOf("export const id = 'main';").id).toBe('main');
  });

  it('flattens a define* wrapper onto the top level', () => {
    expect(constantsOf("export const scene = defineScene({ id: 'start', active: false });")).toMatchObject({
      id: 'start',
      active: false,
    });
  });

  it('flattens defineUI, which a hardcoded name list used to miss', () => {
    // The bug: UI elements registered under their class name instead of this id.
    expect(constantsOf("export const ui = defineUI({ id: 'badge' });").id).toBe('badge');
  });

  it('flattens regardless of what the export is called', () => {
    expect(constantsOf("export const ui_ = defineUI({ id: 'chip' });").id).toBe('chip');
    expect(constantsOf("export const whatever = defineEntity({ id: 'marker' });").id).toBe('marker');
  });

  it('lets an explicit file-level export win over the wrapper', () => {
    const src = "export const id = 'explicit';\nexport const ui = defineUI({ id: 'wrapped' });";
    expect(constantsOf(src).id).toBe('explicit');
  });

  it('ignores calls that are not define helpers', () => {
    expect(constantsOf("export const ui = somethingElse({ id: 'nope' });").id).toBeUndefined();
  });
});
