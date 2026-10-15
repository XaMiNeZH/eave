#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {activityKey, clamp, lerp, easeOutBack, easeOutCubic, morphFrame, sameGeometry, springOvershoot, springProgress} from '../src/lib/motion.js';
import {geometryFor, Geometry} from '../src/lib/constants.js';

let passed = 0;
let failed = 0;

function assert(cond, message) {
    if (cond) {
        passed += 1;
        return;
    }
    failed += 1;
    print(`FAIL: ${message}`);
}

assert(clamp(5, 0, 3) === 3, 'clamp high');
assert(clamp(-1, 0, 3) === 0, 'clamp low');
assert(lerp(0, 10, 0.5) === 5, 'lerp midpoint');
assert(easeOutCubic(0) === 0, 'cubic start');
assert(easeOutCubic(1) === 1, 'cubic end');
assert(Math.abs(easeOutBack(1) - 1) < 1e-9, 'back end');
assert(easeOutBack(0.8) > 1, 'back overshoots before settle');

const mid = morphFrame(Geometry.idle, Geometry.system, 0.5);
assert(mid.width > Geometry.idle.width, 'morph grows width');
assert(mid.width < Geometry.system.width * 1.2, 'morph stays bounded');

assert(sameGeometry(Geometry.idle, {...Geometry.idle}), 'sameGeometry true');
assert(!sameGeometry(Geometry.idle, Geometry.osd), 'sameGeometry false');

assert(geometryFor('idle').width === Geometry.idle.width, 'idle geom');
assert(geometryFor('media', false).width === Geometry.compact.width, 'media compact');
assert(geometryFor('media', true).width === Geometry.mediaExpanded.width, 'media expanded');
assert(geometryFor('volume').height === geometryFor('idle').height, 'osd stays compact height');
assert(geometryFor('media', false).width > geometryFor('idle').width, 'compact media is wider');
assert(geometryFor('charging').compact === true, 'charging stays compact');
assert(geometryFor('charging').width > geometryFor('idle').width, 'charging is wider than idle');
assert(geometryFor('focus').compact === true, 'Focus stays compact');
assert(geometryFor('focus').width === geometryFor('charging').width, 'Focus uses charging pill geometry');
assert(activityKey({id: 'media', kind: 'media', expanded: false}) === 'media:media:0', 'activity key compact');
assert(activityKey({id: 'media', kind: 'media', expanded: true}) === 'media:media:1', 'activity key expanded');

assert(Math.abs(springProgress(0)) < 1e-6, 'spring starts at 0');
assert(Math.abs(springProgress(3) - 1) < 0.02, 'spring settles at 1');
assert(springProgress(0.2) > 0 && springProgress(0.2) < 1, 'spring is in flight at t=0.2');
const overshoot = springOvershoot();
assert(overshoot > 0, 'spring overshoots a little');
assert(overshoot < 0.18, `spring overshoot stays small (${overshoot})`);
assert(springProgress(0.8) > 0.8, 'spring is mostly there by t=0.8 for content fade');

print(`motion: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);
