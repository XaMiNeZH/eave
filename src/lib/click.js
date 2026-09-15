// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Island chrome click. Recording is a compact live activity; expanding it
 * into the old 248×44 system card is a click-collapse / overflow bug.
 */
export function primaryClickAction(kind) {
    if (kind === 'idle')
        return 'bounce';
    if (kind === 'media')
        return 'toggle-expanded';
    return 'dismiss-transient';
}
