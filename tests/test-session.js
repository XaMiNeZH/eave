#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {
    islandAllowedInSession,
    islandCanOpenCalendar,
    islandOnLockScreen,
} from '../src/lib/session.js';

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

assert(!islandAllowedInSession(null), 'a missing session cannot host the island');
assert(!islandAllowedInSession({isGreeter: true, currentMode: 'gdm'}),
    'the GDM greeter cannot host this user extension');
assert(islandAllowedInSession({isGreeter: false, isLocked: false, currentMode: 'user'}),
    'a normal user session can host the island');
assert(islandAllowedInSession({isGreeter: false, isLocked: true, currentMode: 'unlock-dialog'}),
    'the lock screen can keep the island when session-modes includes unlock-dialog');
assert(islandOnLockScreen({isLocked: true, currentMode: 'user'}),
    'isLocked marks the unlock dialog');
assert(islandOnLockScreen({isLocked: false, currentMode: 'unlock-dialog'}),
    'unlock-dialog is the lock screen even before isLocked is set');
assert(!islandOnLockScreen({isLocked: false, currentMode: 'user'}),
    'an unlocked user session is not the lock screen');
assert(!islandCanOpenCalendar({isLocked: true, currentMode: 'unlock-dialog', isGreeter: false}),
    'the lock screen must not open the date menu');
assert(islandCanOpenCalendar({isLocked: false, currentMode: 'user', isGreeter: false}),
    'an unlocked session can open the calendar from the idle pill');

print(`session: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);
