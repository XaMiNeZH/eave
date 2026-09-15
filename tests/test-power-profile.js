#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {Kind, Priority} from '../src/lib/activity-stack.js';
import {Geometry, geometryFor, isExpandedGeometry} from '../src/lib/constants.js';
import {
    POWER_PROFILE_NAMES,
    powerProfileHeadline,
    powerProfileShouldToast,
} from '../src/lib/power-profile.js';

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

assert(powerProfileHeadline('power-saver') === 'Quiet', 'power-saver is the Quiet toast');
assert(powerProfileHeadline('performance') === 'Performance', 'performance toast');
assert(powerProfileHeadline('balanced') === 'Balanced', 'balanced toast');
assert(powerProfileHeadline('mystery') == null, 'unknown profiles are not invented');
assert(!powerProfileShouldToast(null, 'performance'),
    'the current profile is not toasted when the daemon first appears');
assert(powerProfileShouldToast('balanced', 'performance'),
    'switching to performance posts a toast');
assert(!powerProfileShouldToast('performance', 'performance'),
    'an unchanged profile does not toast');
assert(POWER_PROFILE_NAMES.includes('org.freedesktop.UPower.PowerProfiles'),
    'the modern power-profiles-daemon name is watched');
assert(POWER_PROFILE_NAMES.includes('net.hadess.PowerProfiles'),
    'the legacy power-profiles-daemon name is watched');
assert(Kind.POWER_PROFILE === 'power-profile', 'power profile has an activity kind');
assert(geometryFor('power-profile').width === Geometry.charging.width,
    'power profile uses the charging compact pill');
assert(!isExpandedGeometry(geometryFor('power-profile')), 'power profile stays compact');
assert(Priority[Kind.POWER_PROFILE] > Priority[Kind.MEDIA],
    'the profile toast can preempt media for the hold time');
assert(Priority[Kind.POWER_PROFILE] < Priority[Kind.CHARGING],
    'charging still outranks a profile toast');

print(`power-profile: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);
