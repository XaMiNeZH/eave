// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';

import {Kind} from '../activity-stack.js';
import {SourceTracker} from '../utils.js';

const NOTIFICATIONS_SCHEMA = 'org.gnome.desktop.notifications';
const SHOW_BANNERS_KEY = 'show-banners';

/** Mirrors GNOME Do Not Disturb (the global show-banners preference). */
export class FocusSource {
    constructor({stack}) {
        this._stack = stack;
        this._tracker = new SourceTracker();
        this._settings = null;

        try {
            this._settings = new Gio.Settings({schema_id: NOTIFICATIONS_SCHEMA});
            this._tracker.connect(this._settings, `changed::${SHOW_BANNERS_KEY}`,
                () => this._publish());
            this._publish();
        } catch {
            // The desktop schema is present on supported GNOME releases. Keep
            // the extension usable on stripped-down or older installations.
            this._stack.remove('focus');
        }
    }

    _publish() {
        if (!this._settings)
            return;
        if (this._settings.get_boolean(SHOW_BANNERS_KEY)) {
            this._stack.remove('focus');
            return;
        }
        this._stack.upsert({
            id: 'focus',
            kind: Kind.FOCUS,
            persistent: true,
        });
    }

    destroy() {
        this._tracker.destroy();
        this._stack?.remove('focus');
        this._settings = null;
        this._stack = null;
    }
}
