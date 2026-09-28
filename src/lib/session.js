// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * GDM's greeter is a separate gnome-shell that never loads this user
 * extension. If a greeter session somehow imported it, hide the overlay.
 * The lock screen (unlock-dialog) can keep the island when session-modes
 * includes that mode.
 */
export function islandAllowedInSession(mode) {
    if (!mode)
        return false;
    if (mode.isGreeter)
        return false;
    return true;
}

export function islandOnLockScreen(mode) {
    if (!mode)
        return false;
    return mode.isLocked === true || mode.currentMode === 'unlock-dialog';
}

export function islandCanOpenCalendar(mode) {
    return islandAllowedInSession(mode) && !islandOnLockScreen(mode);
}
