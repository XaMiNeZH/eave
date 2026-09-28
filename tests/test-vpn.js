#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {Kind, Priority} from '../src/lib/activity-stack.js';
import {Geometry, geometryFor, isExpandedGeometry} from '../src/lib/constants.js';
import {isVpnConnection, pickActiveVpn, vpnHeadline} from '../src/lib/vpn.js';

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

assert(isVpnConnection({vpn: true, state: 2}), 'NM Vpn=true while activated is a VPN');
assert(isVpnConnection({type: 'wireguard', state: 2}), 'WireGuard is a real NM VPN type');
assert(isVpnConnection({type: 'vpn', state: 2}), 'type=vpn is a VPN');
assert(!isVpnConnection({vpn: true, state: 1}), 'activating VPN is not shown yet');
assert(!isVpnConnection({type: '802-11-wireless', state: 2}), 'Wi-Fi is not a VPN');
assert(!isVpnConnection({type: 'tun', state: 2}), 'a generic tun device is not a VPN');
assert(vpnHeadline('Home') === 'Home', 'the pill uses the NM connection id');
assert(vpnHeadline('') === 'VPN', 'a nameless VPN still has a real caption');
assert(pickActiveVpn([{type: 'vpn', state: 1}, {type: 'wireguard', state: 2, id: 'wg'}])?.id === 'wg',
    'the activated VPN wins');
assert(Kind.VPN === 'vpn', 'VPN has an activity kind');
assert(Priority[Kind.VPN] < Priority[Kind.MEDIA],
    'an idle VPN pill does not cover now-playing');
assert(geometryFor('vpn').width === Geometry.charging.width, 'VPN uses the charging pill');
assert(!isExpandedGeometry(geometryFor('vpn')), 'VPN stays compact');

print(`vpn: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);
