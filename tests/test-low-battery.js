#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {Kind, Priority} from '../src/lib/activity-stack.js';
import {Geometry, geometryFor, isExpandedGeometry} from '../src/lib/constants.js';
import {
    UPowerState,
    UPowerWarning,
    isLowBattery,
    lowBatteryHeadline,
    lowBatteryShouldToast,
} from '../src/lib/low-battery.js';

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

assert(!isLowBattery({present: false, state: UPowerState.DISCHARGING, percent: 5}),
    'a missing battery is not a low-battery pill');
assert(!isLowBattery({present: true, state: UPowerState.CHARGING, percent: 5,
    warningLevel: UPowerWarning.LOW}),
    'charging uses the existing charging face, not low battery');
assert(isLowBattery({present: true, state: UPowerState.DISCHARGING,
    warningLevel: UPowerWarning.LOW, percent: 18}),
    'UPower WarningLevel low while discharging is a low-battery event');
assert(isLowBattery({present: true, state: UPowerState.DISCHARGING,
    warningLevel: UPowerWarning.NONE, percent: 15}),
    'percent at or below 20% while discharging is a low-battery event');
assert(!isLowBattery({present: true, state: UPowerState.DISCHARGING,
    warningLevel: UPowerWarning.NONE, percent: 45}),
    'a healthy discharging battery stays quiet');
assert(lowBatteryHeadline({percent: 12}) === 'Battery 12%',
    'the pill names the remaining percent');
assert(lowBatteryShouldToast(false, true), 'crossing into low battery posts a toast');
assert(!lowBatteryShouldToast(true, true), 'an already-low battery does not keep covering media');
assert(Kind.LOW_BATTERY === 'low-battery', 'low battery has its own activity kind');
assert(Priority[Kind.LOW_BATTERY] < Priority[Kind.CHARGING],
    'plugging in still wins over a low-battery toast');
assert(Priority[Kind.LOW_BATTERY] > Priority[Kind.MEDIA],
    'the low-battery toast can preempt media for the hold time');
assert(geometryFor('low-battery').width === Geometry.charging.width,
    'low battery uses the charging compact pill');
assert(!isExpandedGeometry(geometryFor('low-battery')), 'low battery stays compact');

print(`low-battery: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);
