// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class DynamicIslandPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.title = _('Eave');
        window.default_width = 560;
        window.default_height = 640;

        window.add(this._generalPage(settings));
        window.add(this._sourcesPage(settings));
        window.add(this._clockPage(settings));
    }

    _generalPage(settings) {
        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });

        const takeover = new Adw.PreferencesGroup({
            title: _('Takeover'),
            description: _('The island replaces only the matching system surfaces while enabled. Notifications stay native.'),
        });
        takeover.add(this._switch(settings, 'takeover-osd',
            _('Take over volume and brightness OSD'),
            _('Hide the stock overlay and morph the island instead.')));
        takeover.add(this._switch(settings, 'hide-panel-media-controls',
            _('Hide panel media-controls'),
            _('Keep the GNOME date and time. Hide other MPRIS panel widgets so they do not sit behind the island.')));
        page.add(takeover);

        const motion = new Adw.PreferencesGroup({title: _('Motion')});
        motion.add(this._spin(settings, 'animation-duration',
            _('Morph duration'),
            _('Milliseconds for the pill to change size.'),
            120, 800, 20));
        motion.add(this._spin(settings, 'osd-timeout',
            _('OSD hold time'),
            null, 600, 5000, 100));
        motion.add(this._spin(settings, 'system-timeout',
            _('Charging and Bluetooth hold time'),
            null, 800, 8000, 100));
        page.add(motion);

        const align = new Adw.PreferencesGroup({
            title: _('Alignment'),
            description: _('These sliders move the pill immediately. You do not need to log out. Use a nested test window (./tools/try.sh) only when the extension code itself changed.'),
        });
        align.add(this._spin(settings, 'compact-margin',
            _('Bar inset'),
            _('Pixels of space above and below the compact pill inside the top bar.'),
            0, 8, 1));
        align.add(this._spin(settings, 'vertical-offset',
            _('Vertical nudge'),
            _('Negative moves the island up; positive moves it down.'),
            -24, 24, 1));
        page.add(align);
        return page;
    }

    _sourcesPage(settings) {
        const page = new Adw.PreferencesPage({
            title: _('Activities'),
            icon_name: 'org.gnome.Settings-symbolic',
        });
        const group = new Adw.PreferencesGroup({
            title: _('Live activities'),
            description: _('Each source can morph the island. Turn one off if you want the stock GNOME surface back.'),
        });
        group.add(this._switch(settings, 'enable-media', _('Media playback (MPRIS)'), null));
        group.add(this._switch(settings, 'enable-osd', _('Volume, brightness, mute'), null));
        group.add(this._switch(settings, 'enable-battery', _('Charging'), null));
        group.add(this._switch(settings, 'enable-bluetooth', _('Bluetooth connected'), null));
        group.add(this._switch(settings, 'enable-privacy', _('Microphone, camera, and screen recording'), null));
        page.add(group);
        return page;
    }

    _clockPage(settings) {
        const page = new Adw.PreferencesPage({
            title: _('Clock'),
            icon_name: 'preferences-system-time-symbolic',
        });
        const group = new Adw.PreferencesGroup({
            title: _('Idle pill'),
            description: _('The idle island is an empty notch. The panel clock stays in place. Right-click the pill to open the calendar.'),
        });
        group.add(this._switch(settings, 'show-seconds', _('Show seconds'), null));

        const format = new Adw.ComboRow({
            title: _('Time format'),
            model: new Gtk.StringList({strings: [_('Follow GNOME'), _('12-hour'), _('24-hour')]}),
        });
        const values = ['follow', '12h', '24h'];
        format.selected = Math.max(0, values.indexOf(settings.get_string('clock-format')));
        format.connect('notify::selected', () => {
            settings.set_string('clock-format', values[format.selected] ?? 'follow');
        });
        group.add(format);
        page.add(group);
        return page;
    }

    _switch(settings, key, title, subtitle) {
        const row = new Adw.SwitchRow({title, subtitle: subtitle ?? ''});
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _spin(settings, key, title, subtitle, lower, upper, step) {
        const row = new Adw.SpinRow({
            title,
            subtitle: subtitle ?? '',
            adjustment: new Gtk.Adjustment({
                lower,
                upper,
                step_increment: step,
                page_increment: step * 5,
                value: settings.get_int(key),
            }),
        });
        settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }
}
