#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {primaryClickAction} from '../src/lib/click.js';
import {classifyOsd} from '../src/lib/utils.js';

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

assert(primaryClickAction('idle') === 'bounce', 'idle tap bounces the empty notch');
assert(primaryClickAction('media') === 'toggle-expanded', 'media tap expands or collapses');
assert(primaryClickAction('recording') === 'dismiss-transient',
    'recording stays compact; a click does not open the old system card');
assert(primaryClickAction('charging') === 'dismiss-transient',
    'charging tap dismisses the transient toast');
assert(primaryClickAction('privacy') === 'dismiss-transient',
    'persistent privacy is not expanded by a click');

assert(classifyOsd({names: ['airplane-mode-symbolic']}, 'Airplane Mode') == null,
    'airplane OSD is not stolen as a mute HUD');
assert(classifyOsd({names: ['rfkill-symbolic']}, '') == null,
    'rfkill OSD is not classified as mute or volume');
assert(classifyOsd({names: ['display-brightness-symbolic']}, '') === 'brightness',
    'display brightness still uses the island HUD');
assert(classifyOsd({names: ['keyboard-brightness-symbolic']}, '') === 'brightness',
    'keyboard backlight reuses the brightness HUD instead of a second island');
assert(classifyOsd({names: ['audio-volume-high-symbolic']}, 'Volume') === 'volume',
    'volume OSD still morphs the island');
assert(classifyOsd({iconName: 'microphone-sensitivity-muted-symbolic'}, 'Microphone') === 'mute',
    'microphone OSD stays a mute HUD');

print(`click: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);
