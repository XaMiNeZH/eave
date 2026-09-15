// SPDX-License-Identifier: GPL-3.0-or-later

export const NM_DEVICE_TYPE_WIFI = 2;
export const NM_CONNECTING_MIN = 40;
export const NM_ACTIVATED = 100;

export function wifiIsConnecting(state) {
    const value = Number(state);
    return value >= NM_CONNECTING_MIN && value < NM_ACTIVATED;
}

export function airplaneShouldToast(wasOn, isOn) {
    return isOn === true && wasOn !== true;
}

export function ssidFromBytes(raw) {
    if (raw == null)
        return '';
    if (typeof raw === 'string')
        return raw;
    try {
        if (typeof raw.deepUnpack === 'function')
            raw = raw.deepUnpack();
    } catch {
        // not a variant
    }
    if (Array.isArray(raw) || (raw && typeof raw.length === 'number')) {
        try {
            return new TextDecoder().decode(Uint8Array.from(raw)).replace(/\0+$/, '');
        } catch {
            return '';
        }
    }
    return String(raw);
}

export function wifiHeadline(ssid) {
    const name = String(ssid || '').trim();
    return name ? `Connecting · ${name}` : 'Connecting';
}
