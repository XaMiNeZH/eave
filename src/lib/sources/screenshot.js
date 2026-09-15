// SPDX-License-Identifier: GPL-3.0-or-later

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Kind} from '../activity-stack.js';
import {screenshotHeadline, screenshotShouldToast} from '../screenshot.js';
import {SourceTracker} from '../utils.js';

export class ScreenshotSource {
    constructor({stack, settings}) {
        this._stack = stack;
        this._settings = settings;
        this._tracker = new SourceTracker();
        this._wasInProgress = false;
        this._ui = Main.screenshotUI ?? null;

        this._tracker.connect(settings, 'changed::enable-screenshot', () => {
            if (!settings.get_boolean('enable-screenshot'))
                this._stack.remove('screenshot');
        });

        if (!this._ui)
            return;

        try {
            this._wasInProgress = !!this._ui.screenshot_in_progress;
            this._tracker.connect(this._ui, 'notify::screenshot-in-progress', () => this._onChange());
        } catch {
            this._ui = null;
        }
    }

    _onChange() {
        const ui = this._ui;
        if (!ui)
            return;
        const inProgress = !!ui.screenshot_in_progress;
        const screencastInProgress = !!ui.screencast_in_progress;
        const shouldToast = screenshotShouldToast({
            wasInProgress: this._wasInProgress,
            inProgress,
            screencastInProgress,
            sessionMode: Main.sessionMode?.currentMode,
        });
        this._wasInProgress = inProgress;
        if (shouldToast)
            this._publish();
    }

    _publish() {
        if (!this._settings.get_boolean('enable-screenshot') || !this._ui) {
            this._stack.remove('screenshot');
            return;
        }
        this._stack.upsert({
            id: 'screenshot',
            kind: Kind.SCREENSHOT,
            persistent: false,
            durationMs: this._settings.get_int('system-timeout'),
            payload: {title: screenshotHeadline()},
        });
    }

    destroy() {
        this._tracker.destroy();
        this._stack.remove('screenshot');
        this._ui = null;
        this._stack = null;
        this._settings = null;
    }
}
