// SPDX-License-Identifier: GPL-3.0-or-later

export function privacyHeadline(payload) {
    const camera = !!payload?.camera;
    const mic = !!payload?.mic;
    if (camera && mic)
        return 'Camera · Mic';
    if (camera)
        return 'Camera';
    if (mic)
        return 'Microphone';
    return 'In use';
}
