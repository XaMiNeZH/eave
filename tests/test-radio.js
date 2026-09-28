#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {Kind, Priority} from '../src/lib/activity-stack.js';
import {Geometry, geometryFor, isExpandedGeometry} from '../src/lib/constants.js';
import {
    airplaneShouldToast,
    ssidFromBytes,
    wifiHeadline,
    wifiIsConnecting,
} from '../src/lib/radio.js';

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

assert(wifiIsConnecting(50), 'NM CONFIG is a connecting state');
assert(wifiIsConnecting(70), 'NM IP_CONFIG is a connecting state');
assert(!wifiIsConnecting(100), 'NM ACTIVATED is not connecting');
assert(!wifiIsConnecting(30), 'NM DISCONNECTED is not connecting');
assert(wifiHeadline('Cafe') === 'Connecting · Cafe', 'connecting names the SSID');
assert(wifiHeadline('') === 'Connecting', 'connecting without an SSID stays generic');
assert(ssidFromBytes([67, 97, 102, 101]) === 'Cafe', 'SSID byte arrays decode');
assert(airplaneShouldToast(false, true), 'enabling airplane mode posts a toast');
assert(!airplaneShouldToast(true, true), 'an already-on airplane mode does not keep covering media');
assert(Kind.AIRPLANE === 'airplane' && Kind.WIFI === 'wifi', 'radio kinds are explicit');
assert(geometryFor('airplane').width === Geometry.charging.width, 'airplane uses the charging pill');
assert(geometryFor('wifi').width === Geometry.charging.width, 'wifi uses the charging pill');
assert(!isExpandedGeometry(geometryFor('airplane')), 'airplane stays compact');
assert(Priority[Kind.AIRPLANE] > Priority[Kind.MEDIA], 'airplane toast can preempt media');
assert(Priority[Kind.WIFI] > Priority[Kind.MEDIA], 'wifi connecting can preempt media');
assert(Priority[Kind.WIFI] < Priority[Kind.AIRPLANE], 'airplane outranks wifi connecting');

print(`radio: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);
