#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {
    Geometry,
    compactHeightForPanel,
    compactTopInset,
    fitGeometryToPanel,
    geometryFor,
    isExpandedGeometry,
} from '../src/lib/constants.js';

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

assert(compactHeightForPanel(32) === 30, '32px panel → 30px compact pill');
assert(compactTopInset(32, 30) === 1, '32px panel centers 30px pill with 1px inset');
assert(compactHeightForPanel(32) + compactTopInset(32, compactHeightForPanel(32)) * 2 === 32,
    'compact pill plus insets fills a 32px panel');

assert(compactHeightForPanel(28) === 26, '28px panel → 26px compact pill');
assert(compactTopInset(28, 26) === 1, '28px panel centers 26px pill');

const tall = compactHeightForPanel(48);
assert(tall === 42, '48px panel uses a slightly larger inset');
assert(compactTopInset(48, tall) === 3, '48px panel centers the taller pill');
assert(tall + compactTopInset(48, tall) * 2 === 48, 'compact pill plus insets fills a 48px panel');

const idle = fitGeometryToPanel(Geometry.idle, 32);
assert(idle.height === 30, 'idle height tracks the panel');
assert(idle.radius === 15, 'idle radius stays a half-capsule');
assert(idle.compact === true, 'idle stays compact');
assert(!isExpandedGeometry(idle), 'fitted idle is not expanded');

const compact = fitGeometryToPanel(Geometry.compact, 32);
assert(compact.height === idle.height, 'media compact matches idle height');
assert(compact.width === Geometry.compact.width, 'media compact keeps its width');

const charging = fitGeometryToPanel(geometryFor('charging'), 32);
assert(charging.compact === true, 'charging stays compact');
assert(charging.height === idle.height, 'charging height matches idle after fit');
assert(charging.radius === idle.radius, 'charging keeps a stadium radius after fit');
assert(charging.width > idle.width, 'charging is wider than the idle notch');
assert(geometryFor('call').width === Geometry.charging.width, 'calls match charging width');
assert(!isExpandedGeometry(geometryFor('call')), 'calls stay a compact pill');

const osd = fitGeometryToPanel(geometryFor('volume'), 32);
assert(osd.height === idle.height, 'osd height matches idle after fit');

const system = fitGeometryToPanel(Geometry.system, 32);
assert(system.height === Geometry.system.height, 'system toast keeps designed height');
assert(isExpandedGeometry(system), 'system toast is expanded');

assert(isExpandedGeometry(Geometry.mediaExpanded), 'media expanded is expanded');
assert(!isExpandedGeometry(geometryFor('privacy', false)), 'privacy compact is not expanded');
assert(isExpandedGeometry(geometryFor('privacy', true)), 'privacy expanded is expanded');

assert(compactHeightForPanel(32, 0) === 32, 'zero margin fills a 32px panel');
assert(compactHeightForPanel(32, 2) === 28, 'custom margin 2 shrinks the pill');
assert(fitGeometryToPanel(Geometry.idle, 32, {margin: 2}).height === 28,
    'fitGeometryToPanel honors a custom margin');
assert(fitGeometryToPanel(Geometry.idle, 32, {margin: 2}).radius === 14,
    'custom margin keeps a half-capsule radius');

assert(Geometry.compact.width === 152, 'compact media is wide enough for art plus waves');
assert(Geometry.mediaExpanded.width === 344, 'expanded media card is compact');
assert(Geometry.mediaExpanded.height === 84, 'expanded media card is content-filled');
assert(Geometry.mediaExpanded.radius === 22, 'expanded media keeps moderate round corners');
assert(Geometry.osd.width === 272, 'volume HUD is wide enough for a thick capsule');
assert(Geometry.idle.width === 88, 'idle notch is a small empty pill');
assert(geometryFor('idle').width === 88, 'idle geometry is the empty notch');
assert(geometryFor('media', false).width === Geometry.compact.width, 'hover stays on compact geometry');
assert(geometryFor('media', false).compact === true, 'compact media is not expanded');
assert(geometryFor('media', true).compact === false, 'click expand uses expanded geometry');
assert(geometryFor('media', false).width > geometryFor('idle').width, 'compact media is wider than idle');
assert(geometryFor('media', true).height > geometryFor('media', false).height,
    'expanded media is taller than compact');

print(`geometry: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);
