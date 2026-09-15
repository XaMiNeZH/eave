#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {Kind, Priority} from '../src/lib/activity-stack.js';
import {Geometry, geometryFor, isExpandedGeometry} from '../src/lib/constants.js';
import {nightLightHeadline, nightLightShouldToast} from '../src/lib/night-light.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        passed += 1;
        return;
    }
    failed += 1;
    print(`FAIL: ${message}`);
}

assert(nightLightHeadline(true) === 'Night Light', 'on uses a short caption');
assert(nightLightHeadline(false) === 'Night Light Off', 'off is also a real signal');
assert(nightLightHeadline(null) == null, 'unknown state has no caption');
assert(!nightLightShouldToast(null, true), 'the first appear is not a toast');
assert(!nightLightShouldToast(true, true), 'a stable on state does not re-toast');
assert(nightLightShouldToast(false, true), 'turning on toasts');
assert(nightLightShouldToast(true, false), 'turning off toasts');
assert(Kind.NIGHT_LIGHT === 'night-light', 'night light has an activity kind');
assert(Priority[Kind.NIGHT_LIGHT] < Priority[Kind.CHARGING],
    'charging still outranks night light');
assert(geometryFor('night-light').width === Geometry.charging.width,
    'night light uses the charging pill');
assert(!isExpandedGeometry(geometryFor('night-light')), 'night light stays compact');

print(`night-light: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);
