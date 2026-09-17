#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';

import {
    clampVolumeFraction,
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

const [, cssBytes] = GLib.file_get_contents('src/stylesheet.css');
const css = new TextDecoder().decode(cssBytes);
assert(css.includes('.dynamic-island-media-expanded {\n    spacing: 10px;\n    min-width: 0;'),
    'expanded media can shrink so the volume column does not push titles out');
assert(css.includes('.dynamic-island-media-left {\n    spacing: 5px;\n    min-width: 0;'),
    'the volume column does not force a minimum width that overflows the pill');

print(`volume: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);
