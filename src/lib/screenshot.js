// SPDX-License-Identifier: GPL-3.0-or-later

export function screenshotHeadline() {
    return 'Screenshot';
}

export function screenshotShouldToast({
    wasInProgress,
    inProgress,
    screencastInProgress,
    sessionMode,
} = {}) {
    const mode = String(sessionMode || '');
    if (mode === 'gdm' || mode === 'unlock-dialog')
        return false;
    if (screencastInProgress)
        return false;
    return inProgress === true && wasInProgress !== true;
}
