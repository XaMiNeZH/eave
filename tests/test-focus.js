#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {Kind, Priority} from '../src/lib/activity-stack.js';
import {Geometry, geometryFor, isExpandedGeometry} from '../src/lib/constants.js';
import {focusShouldToast, isFocusActive} from '../src/lib/focus.js';
import {privacyHeadline} from '../src/lib/privacy.js';

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

assert(isFocusActive(false), 'disabled notification banners activate the focus pill');
assert(!isFocusActive(true), 'enabled notification banners do not activate focus');
assert(!isFocusActive(false, false), 'lock or greeter sessions cannot receive focus chrome');
assert(focusShouldToast(false, true), 'turning DND on posts a compact toast');
assert(!focusShouldToast(true, true), 'an already-on DND session does not keep covering media');
assert(!focusShouldToast(true, false), 'turning DND off does not toast');
assert(Kind.FOCUS === 'focus', 'focus has an explicit activity kind');
assert(Priority[Kind.FOCUS] > Priority[Kind.MEDIA],
    'the focus toast can preempt media for the hold time');
assert(Priority[Kind.FOCUS] < Priority[Kind.PRIVACY],
    'privacy indicators retain their higher-priority safety signal');
assert(geometryFor('focus').width === Geometry.charging.width,
    'focus uses the charging compact pill width');
assert(geometryFor('focus').height === Geometry.charging.height,
    'focus stays bar height like charging');
assert(!isExpandedGeometry(geometryFor('privacy', true)),
    'privacy mic/cam cannot become a system card');
assert(geometryFor('privacy').width === Geometry.charging.width,
    'privacy uses the charging compact pill family');
assert(privacyHeadline({mic: true}) === 'Microphone', 'mic-only privacy names the microphone');
assert(privacyHeadline({camera: true}) === 'Camera', 'camera-only privacy names the camera');
assert(privacyHeadline({camera: true, mic: true}) === 'Camera · Mic',
    'combined privacy keeps a charging-style headline');

print(`focus: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);
