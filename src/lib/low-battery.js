// SPDX-License-Identifier: GPL-3.0-or-later

export const UPowerState = Object.freeze({
    CHARGING: 1,
    DISCHARGING: 2,
    EMPTY: 3,
    FULLY_CHARGED: 4,
});

export const UPowerWarning = Object.freeze({
    UNKNOWN: 0,
    NONE: 1,
    DISCHARGING: 2,
    LOW: 3,
    CRITICAL: 4,
    ACTION: 5,
});

/**
 * Charging already has its own compact face. Low battery is the
 * discharging warning from UPower, not a second charging toast.
 */
export function isLowBattery({present, state, warningLevel, percent} = {}) {
    if (!present)
        return false;
    const discharging = state === UPowerState.DISCHARGING || state === UPowerState.EMPTY;
    if (!discharging)
        return false;
    if (Number(warningLevel) >= UPowerWarning.LOW)
        return true;
    return Number(percent) <= 20;
}

export function lowBatteryHeadline({percent, warningLevel} = {}) {
    const n = Math.round(Number(percent) || 0);
    if (Number(warningLevel) >= UPowerWarning.CRITICAL)
        return n > 0 ? `Battery ${n}%` : 'Battery critical';
    return n > 0 ? `Battery ${n}%` : 'Low Battery';
}

export function lowBatteryShouldToast(wasLow, isLow) {
    return isLow === true && wasLow !== true;
}
