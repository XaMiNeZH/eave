#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {
    FALLBACK_PALETTE,
    mixHex,
    paletteFromSamples,
    paletteFromRgbaBytes,
    rgbToHex,
    sampleVibrancy,
} from '../src/lib/palette.js';
import {
    BAR_COUNT,
    barHeightPx,
    proceduralLevel,
    proceduralLevels,
} from '../src/lib/waveform.js';
import {
    displayedPlaybackUs,
    osdFillWidth,
    playbackNeedsResync,
    progressFillWidth,
} from '../src/lib/utils.js';
import {Geometry} from '../src/lib/constants.js';

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

assert(FALLBACK_PALETTE.accent.startsWith('#'), 'fallback accent is hex');
assert(rgbToHex(1, 0, 0) === '#ff0000', 'rgbToHex red');
assert(mixHex('#000000', '#ffffff', 0.5) === '#808080', 'mixHex mid grey');

const black = {r: 0.02, g: 0.02, b: 0.02};
const red = {r: 0.86, g: 0.18, b: 0.16};
const cream = {r: 0.92, g: 0.84, b: 0.70};
assert(sampleVibrancy(red) > sampleVibrancy(black), 'vibrant red beats near-black');

const palette = paletteFromSamples([black, black, red, cream]);
assert(palette.primary !== FALLBACK_PALETTE.primary, 'sampled palette is not fallback');
assert(palette.primary.startsWith('#'), 'primary is hex');
assert(palette.accent.startsWith('#'), 'accent is hex');

const empty = paletteFromSamples([]);
assert(empty.primary === FALLBACK_PALETTE.primary, 'empty samples use fallback');

const bytes = Uint8Array.from([
    20, 20, 20, 255,
    220, 40, 36, 255,
    30, 30, 30, 0,
    240, 210, 160, 255,
]);
const fromBytes = paletteFromRgbaBytes(bytes, {width: 2, height: 2, nChannels: 4});
assert(fromBytes.primary !== FALLBACK_PALETTE.primary, 'rgba grid yields a palette');

assert(proceduralLevels(0.4).length === BAR_COUNT, 'procedural waveform has 6 bars');
assert(proceduralLevels(1.2).every(n => n >= 0 && n <= 1), 'procedural levels are 0..1');
assert(proceduralLevel(0, 1, {playing: false}) === 0, 'paused bars rest at zero');
assert(barHeightPx(0, 22) === 3, 'silence is a 3px dot');
assert(barHeightPx(1, 22) === 22, 'full level fills the strip');
assert(proceduralLevel(0, 0.3, {playing: true}) !==
    proceduralLevel(3, 0.3, {playing: true}), 'bars are staggered');

const now = 5_000_000;
const shown = displayedPlaybackUs({
    playing: true,
    positionUs: 10_000_000,
    lengthUs: 120_000_000,
    anchorMonoUs: now,
}, now + 500_000);
assert(shown === 10_500_000, `interpolated clock ${shown}`);

const paused = displayedPlaybackUs({
    playing: false,
    positionUs: 10_000_000,
    lengthUs: 120_000_000,
    anchorMonoUs: now,
}, now + 500_000);
assert(paused === 10_000_000, 'paused clock does not run');

const capped = displayedPlaybackUs({
    playing: true,
    positionUs: 119_000_000,
    lengthUs: 120_000_000,
    anchorMonoUs: now,
}, now + 5_000_000);
assert(capped === 120_000_000, 'clock stops at duration');

assert(!playbackNeedsResync(10_000_000, 10_400_000), 'small drift does not resync');
assert(playbackNeedsResync(10_000_000, 13_000_000), 'a seek resyncs the clock');
assert(progressFillWidth(0, 320) === 0, 'seek fill starts at the left edge');
assert(progressFillWidth(0.5, 320) === 160, 'seek fill uses allocated rail width');
assert(progressFillWidth(0.125, 320) === 40, 'seek fill advances before playback ends');
assert(progressFillWidth(1, 148) === 148,
    'OSD level fill reaches the entire allocated rail at 100%');
assert(progressFillWidth(1.4, 320) === 320, 'seek fill is capped at rail width');
assert(osdFillWidth(0, 148) === 0, 'OSD level zero leaves the allocated rail empty');
assert(osdFillWidth(1, 148) === 148,
    'OSD level one fills the complete allocated rail, independent of percent text');
assert(osdFillWidth(1, 0) === 0, 'OSD level respects an empty rail allocation');

assert(Geometry.mediaExpanded.width === 344, 'expanded media has compact player width');
assert(Geometry.mediaExpanded.height === 84, 'expanded media avoids an empty lower panel');
assert(Geometry.mediaExpanded.radius === 22, 'expanded media has moderate round corners');
assert(Geometry.mediaExpanded.radius < Geometry.mediaExpanded.height / 2,
    'expanded media is a rounded rect, not a stadium');

print(`media-style: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);
