// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * GNOME's global Do Not Disturb switch stores whether notification banners
 * are shown. Locked and greeter sessions must never receive normal-session
 * island chrome.
 */
export function isFocusActive(showBanners, sessionIsUsable = true) {
    return sessionIsUsable && showBanners === false;
}

/** Rising edge only — a persistent DND pill would hide media for the whole session. */
export function focusShouldToast(wasActive, isActive) {
    return isActive === true && wasActive !== true;
}
