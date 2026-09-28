// SPDX-License-Identifier: GPL-3.0-or-later

export const SWIPE_THRESHOLD = 28;

export function eventPoint(event) {
    try {
        const coords = event.get_coords();
        return {
            x: coords[coords.length - 2] ?? coords[0] ?? 0,
            y: coords[coords.length - 1] ?? coords[1] ?? 0,
        };
    } catch {
        return null;
    }
}

export function swipeIntent(dx, dy, threshold = SWIPE_THRESHOLD) {
    const ax = Math.abs(Number(dx) || 0);
    const ay = Math.abs(Number(dy) || 0);
    if (Math.max(ax, ay) < threshold)
        return null;
    if (ay >= ax)
        return dy > 0 ? 'down' : 'up';
    return dx > 0 ? 'right' : 'left';
}

export function swipeAction(intent, {kind, expanded} = {}) {
    if (!intent)
        return null;
    if (kind === 'volume' || kind === 'brightness' || kind === 'mute')
        return 'dismiss';
    if (kind === 'media' && expanded)
        return 'collapse';
    return null;
}
