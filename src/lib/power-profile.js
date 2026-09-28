// SPDX-License-Identifier: GPL-3.0-or-later

export const POWER_PROFILE_NAMES = Object.freeze([
    'org.freedesktop.UPower.PowerProfiles',
    'net.hadess.PowerProfiles',
]);

export const POWER_PROFILE_PATHS = Object.freeze({
    'org.freedesktop.UPower.PowerProfiles': '/org/freedesktop/UPower/PowerProfiles',
    'net.hadess.PowerProfiles': '/net/hadess/PowerProfiles',
});

export function powerProfileHeadline(profile) {
    switch (String(profile || '')) {
    case 'power-saver':
        return 'Quiet';
    case 'performance':
        return 'Performance';
    case 'balanced':
        return 'Balanced';
    default:
        return null;
    }
}

export function powerProfileShouldToast(previous, next) {
    const headline = powerProfileHeadline(next);
    if (!headline)
        return false;
    if (previous == null)
        return false;
    return previous !== next;
}
