#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {ActivityStack, Kind, Priority} from '../src/lib/activity-stack.js';

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

function assertEq(actual, expected, message) {
    assert(actual === expected, `${message} (got ${actual}, expected ${expected})`);
}

let now = 1_000;
const stack = new ActivityStack({now: () => now});

assertEq(stack.current().kind, Kind.IDLE, 'empty stack is idle');
assertEq(stack.current().expanded, false, 'idle is not expanded');

stack.upsert({id: 'media', kind: Kind.MEDIA, persistent: true, payload: {title: 'Song'}});
assertEq(stack.current().kind, Kind.MEDIA, 'persistent media is current');
assertEq(stack.current().payload.title, 'Song', 'media payload kept');

stack.upsert({id: 'focus', kind: Kind.FOCUS, persistent: true});
assertEq(stack.current().kind, Kind.FOCUS, 'Focus preempts media while Do Not Disturb is on');
stack.remove('focus');
assertEq(stack.current().kind, Kind.MEDIA, 'turning off Do Not Disturb restores media');

stack.upsert({id: 'osd-volume', kind: Kind.VOLUME, durationMs: 500, payload: {level: 0.4}});
assertEq(stack.current().kind, Kind.VOLUME, 'transient OSD preempts media');

now += 600;
stack.expireDue();
assertEq(stack.current().kind, Kind.MEDIA, 'expired OSD returns to media');

stack.upsert({id: 'charging', kind: Kind.CHARGING, durationMs: 1000, payload: {percent: 80}});
assertEq(stack.current().kind, Kind.CHARGING, 'system activity preempts media');
assertEq(stack.current().priority, Priority[Kind.CHARGING], 'system activity priority');

stack.toggleExpanded();
assertEq(stack.current().expanded, true, 'can expand current activity');
stack.toggleExpanded();
assertEq(stack.current().expanded, false, 'toggle collapses');

stack.toggleExpanded();
now += 1000;
stack.expireDue();
assertEq(stack.current().kind, Kind.MEDIA, 'expiring current also clears expand');
assertEq(stack.current().expanded, false, 'expand does not leak to media');

stack.upsert({id: 'osd-volume', kind: Kind.VOLUME, durationMs: 200});
stack.upsert({id: 'osd-brightness', kind: Kind.BRIGHTNESS, durationMs: 200});
assertEq(stack.current().kind, Kind.BRIGHTNESS, 'same priority prefers newer seq');

stack.remove('osd-brightness');
assertEq(stack.current().kind, Kind.VOLUME, 'remove reveals previous OSD');

stack.clear();
assertEq(stack.current().kind, Kind.IDLE, 'clear returns idle');
assertEq(stack.size, 0, 'clear empties map');

stack.upsert({id: 'media', kind: Kind.MEDIA, persistent: true});
const next = stack.nextExpiryAt();
assert(next == null, 'persistent items have no expiry');

stack.upsert({id: 'n', kind: Kind.BLUETOOTH, durationMs: 250});
assert(stack.nextExpiryAt() === now + 250, 'nextExpiryAt tracks soonest transient');

print(`activity-stack: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);
