#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {Kind, Priority} from '../src/lib/activity-stack.js';
import {
    CallState,
    callCaption,
    callHeadline,
    isLiveCall,
    pickForegroundCall,
} from '../src/lib/call.js';
import {Geometry, geometryFor, isExpandedGeometry} from '../src/lib/constants.js';

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

assert(isLiveCall(CallState.INCOMING), 'incoming Calls objects are live');
assert(isLiveCall(CallState.ACTIVE), 'active Calls objects are live');
assert(!isLiveCall(CallState.DISCONNECTED), 'disconnected Calls objects are ignored');
assert(!isLiveCall(CallState.UNKNOWN), 'unknown Calls objects are ignored');
assert(callHeadline({state: CallState.INCOMING, displayName: 'Ada'}) === 'Ada',
    'incoming headline prefers the address-book name');
assert(callHeadline({state: CallState.INCOMING, id: '+1555'}) === '+1555',
    'incoming headline falls back to the call id');
assert(callHeadline({state: CallState.ACTIVE}) === 'On a call',
    'active calls without identity still have a real caption');
assert(callCaption(CallState.INCOMING) === 'Incoming', 'incoming caption');
assert(callCaption(CallState.DIALING) === 'Calling', 'dialing caption');
assert(pickForegroundCall([
    {state: CallState.HELD, id: 'held'},
    {state: CallState.INCOMING, id: 'ring'},
    {state: CallState.ACTIVE, id: 'talk'},
])?.id === 'ring', 'an incoming call wins over an in-progress one');
assert(pickForegroundCall([{state: CallState.DISCONNECTED}]) == null,
    'disconnected-only lists produce no island activity');
assert(Kind.CALL === 'call', 'calls have an explicit activity kind');
assert(Priority[Kind.CALL] > Priority[Kind.CHARGING],
    'a live call preempts charging and media');
assert(geometryFor('call').width === Geometry.charging.width,
    'calls use the charging compact pill family');
assert(!isExpandedGeometry(geometryFor('call')), 'calls stay a compact pill');

print(`calls: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);
