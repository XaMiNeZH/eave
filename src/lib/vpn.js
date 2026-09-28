// SPDX-License-Identifier: GPL-3.0-or-later

export const NM_ACTIVE_STATE_ACTIVATED = 2;

export function isVpnConnection({vpn, type, state} = {}) {
    if (Number(state) !== NM_ACTIVE_STATE_ACTIVATED)
        return false;
    if (vpn === true)
        return true;
    const kind = String(type || '').toLowerCase();
    return kind === 'vpn' || kind === 'wireguard';
}

export function vpnHeadline(id) {
    const name = String(id || '').trim();
    return name || 'VPN';
}

export function pickActiveVpn(connections) {
    return (connections ?? []).find(row => isVpnConnection(row)) ?? null;
}
