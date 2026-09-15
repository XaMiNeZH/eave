// SPDX-License-Identifier: GPL-3.0-or-later

/** org.gnome.Calls.Call State values. */
export const CallState = Object.freeze({
    UNKNOWN: 0,
    ACTIVE: 1,
    HELD: 2,
    DIALING: 3,
    ALERTING: 4,
    INCOMING: 5,
    WAITING: 6,
    DISCONNECTED: 7,
});

export function isLiveCall(state) {
    const value = Number(state);
    return value === CallState.ACTIVE ||
        value === CallState.HELD ||
        value === CallState.DIALING ||
        value === CallState.ALERTING ||
        value === CallState.INCOMING ||
        value === CallState.WAITING;
}

export function callHeadline(call) {
    const name = String(call?.displayName || '').trim();
    const id = String(call?.id || '').trim();
    const party = name || id;
    if (Number(call?.state) === CallState.INCOMING || Number(call?.state) === CallState.WAITING)
        return party || 'Incoming';
    if (Number(call?.state) === CallState.DIALING || Number(call?.state) === CallState.ALERTING)
        return party || 'Calling';
    return party || 'On a call';
}

export function callCaption(state) {
    switch (Number(state)) {
    case CallState.INCOMING:
    case CallState.WAITING:
        return 'Incoming';
    case CallState.DIALING:
    case CallState.ALERTING:
        return 'Calling';
    case CallState.HELD:
        return 'On hold';
    case CallState.ACTIVE:
        return 'Active';
    default:
        return '';
    }
}

export function pickForegroundCall(calls) {
    const live = (calls ?? []).filter(call => isLiveCall(call?.state));
    if (!live.length)
        return null;
    const rank = state => {
        switch (Number(state)) {
        case CallState.INCOMING:
        case CallState.WAITING:
            return 4;
        case CallState.DIALING:
        case CallState.ALERTING:
            return 3;
        case CallState.ACTIVE:
            return 2;
        case CallState.HELD:
            return 1;
        default:
            return 0;
        }
    };
    return live.slice().sort((a, b) => rank(b.state) - rank(a.state))[0];
}
