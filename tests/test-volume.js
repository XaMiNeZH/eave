#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {
    clampVolumeFraction,
    describeSinks,
    sinkIdentity,
    sinkLabel,
    sinkPickerAvailable,
    volumeFraction,
    volumeTarget,
} from '../src/lib/volume.js';

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

const maximum = 65_536;
assert(clampVolumeFraction(-1) === 0, 'volume clamps below zero');
assert(clampVolumeFraction(2) === 1, 'volume clamps above one');
assert(volumeFraction(0, maximum) === 0, 'silent sink maps to zero');
assert(volumeFraction(maximum, maximum) === 1, 'normal maximum maps to one');
assert(volumeFraction(maximum / 2, maximum) === 0.5, 'sink level is normalized');
assert(volumeFraction(1, 0) === 0, 'invalid maximum hides an unusable sink level');
assert(volumeTarget(0, maximum) === 0, 'zero drag writes silence');
assert(volumeTarget(1, maximum) === maximum, 'full drag writes the normal maximum');
assert(volumeTarget(0.5, maximum) === maximum / 2, 'midpoint drag writes half volume');
assert(volumeTarget(2, maximum) === maximum, 'drag target caps at normal maximum');

const read = (sink, property) => sink[property];
const speakers = {id: 1, description: 'Built-in Speakers', name: 'alsa_output'};
const headphones = {id: 2, description: 'USB Headset', name: 'usb_output'};
assert(sinkIdentity(speakers, read) === 1, 'sink identity prefers the Gvc id');
assert(sinkLabel(speakers, read) === 'Built-in Speakers', 'sink label prefers the description');
assert(describeSinks([speakers, headphones], headphones, read).find(row => row.active)?.id === 2,
    'the default Gvc sink is marked active');
assert(describeSinks([speakers, headphones], headphones, read).length === 2,
    'every real Gvc sink is offered');
assert(describeSinks([], speakers, read).length === 0, 'a missing sink list stays empty');
assert(!sinkPickerAvailable(describeSinks([speakers], speakers, read)),
    'a single Gvc sink does not open a picker that would overflow the 84px card');
assert(sinkPickerAvailable(describeSinks([speakers, headphones], headphones, read)),
    'two real Gvc sinks can replace the artist line with a picker');

print(`volume: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);
