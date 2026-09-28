#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {swipeAction, swipeIntent} from '../src/lib/swipe.js';

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

assert(swipeIntent(4, 2) == null, 'a tap is not a swipe');
assert(swipeIntent(0, 40) === 'down', 'a downward drag is a swipe');
assert(swipeIntent(0, -40) === 'up', 'an upward drag is a swipe');
assert(swipeIntent(40, 4) === 'right', 'a horizontal drag is a swipe');
assert(swipeAction('down', {kind: 'volume'}) === 'dismiss', 'OSD swipes dismiss');
assert(swipeAction('left', {kind: 'brightness'}) === 'dismiss', 'brightness swipes dismiss');
assert(swipeAction('down', {kind: 'media', expanded: true}) === 'collapse',
    'expanded media swipes collapse');
assert(swipeAction('down', {kind: 'media', expanded: false}) == null,
    'compact media is not dismissed by a swipe');
assert(swipeAction('down', {kind: 'idle'}) == null, 'the idle notch ignores swipes');
assert(swipeAction('down', {kind: 'charging'}) == null,
    'charging toasts are not dismissed by a swipe that should stay a tap');
assert(swipeAction(null, {kind: 'volume'}) == null, 'no intent does nothing');

print(`swipe: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);
