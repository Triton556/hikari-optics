import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeState} from '../src/optics.js';
test('new experiment controls reject nonfinite values and unknown experiments',()=>{
 const s=normalizeState({paneAngle:NaN,inlineSourceAngle:Infinity,experiment:'unknown'});
 assert.equal(s.paneAngle,Math.PI*.75);assert.equal(s.inlineSourceAngle,-.85);assert.equal(s.experiment,undefined);
});
test('comparison holds a bounded shutter only for an installed bypassed filter',()=>{
 assert.equal(normalizeState({filter:'none',filterBypass:true,compareShutter:.2}).filterBypass,false);
 assert.equal(normalizeState({filter:'cpl',filterBypass:true,compareShutter:5}).compareShutter,.25);
 assert.equal(normalizeState({filter:'cpl',filterBypass:false,compareShutter:.2}).compareShutter,undefined);
});
