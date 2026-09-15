// SPDX-License-Identifier: GPL-3.0-or-later

export const COLOR_NAME = 'org.gnome.SettingsDaemon.Color';
export const COLOR_PATH = '/org/gnome/SettingsDaemon/Color';
export const COLOR_IFACE = 'org.gnome.SettingsDaemon.Color';
export const NIGHT_LIGHT_SCHEMA = 'org.gnome.desktop.night-light';

export function nightLightHeadline(active) {
    if (active === true)
        return 'Night Light';
    if (active === false)
        return 'Night Light Off';
    return null;
}

export function nightLightShouldToast(previous, next) {
    if (typeof previous !== 'boolean' || typeof next !== 'boolean')
        return false;
    return previous !== next;
}
