#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {Kind, Priority} from '../src/lib/activity-stack.js';
import {Geometry, geometryFor, isExpandedGeometry} from '../src/lib/constants.js';
import {screenshotHeadline, screenshotShouldToast} from '../src/lib/screenshot.js';

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

assert(screenshotHeadline() === 'Screenshot', 'screenshot uses a short caption');
assert(screenshotShouldToast({wasInProgress: false, inProgress: true}),
    'opening the Shell screenshot UI toasts');
assert(!screenshotShouldToast({wasInProgress: true, inProgress: true}),
    'staying in the screenshot UI does not re-toast');
assert(!screenshotShouldToast({wasInProgress: false, inProgress: false}),
    'idle is not a screenshot toast');
assert(!screenshotShouldToast({
    wasInProgress: false,
    inProgress: true,
    screencastInProgress: true,
}), 'screencast stays on the recording face');
assert(!screenshotShouldToast({
    wasInProgress: false,
    inProgress: true,
    sessionMode: 'gdm',
}), 'the greeter does not toast');
assert(!screenshotShouldToast({
    wasInProgress: false,
    inProgress: true,
    sessionMode: 'unlock-dialog',
}), 'the unlock dialog does not toast');
assert(Kind.SCREENSHOT === 'screenshot', 'screenshot has an activity kind');
assert(Priority[Kind.SCREENSHOT] < Priority[Kind.CHARGING],
    'charging still outranks screenshot');
assert(geometryFor('screenshot').width === Geometry.charging.width,
    'screenshot uses the charging pill');
assert(!isExpandedGeometry(geometryFor('screenshot')), 'screenshot stays compact');

print(`screenshot: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);
