import test from 'node:test';
import assert from 'node:assert/strict';
import { FOCAL_PRESETS, focalPatch } from '../src/focus-presets.js';
import { maxAperture, normalizeState } from '../src/optics.js';
test('focal recipes retain scene arrangement and focus for comparison', () => {
  for (const preset of FOCAL_PRESETS) {
    const patch = focalPatch(preset.id);
    const state = normalizeState({focus:2.2,catDistance:1.5,flowerDistance:2.2,chartDistance:3, ...patch});
    assert.equal(state.focus,2.2);
    assert.equal(state.focal,preset.focal);
    assert.equal(state.aperture,maxAperture(preset.focal));
    assert.equal(state.catDistance,1.5);
    assert.equal(state.flowerDistance,2.2);
    assert.equal(state.chartDistance,3);
    assert.equal(state.filter,'none');
    assert.equal(state.experiment,undefined);
    assert.equal(state.exposureAuto,true);
  }
  assert.equal(focalPatch('unknown'),null);
});
