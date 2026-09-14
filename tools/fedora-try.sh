#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Manual checklist helpers for Fedora Workstation (GNOME 49–51).
set -euo pipefail

echo "Eave — Fedora try-this list"
echo "0. Prefer:   ./tools/try.sh   (nested GNOME window, no logout)"
echo "1. Or host:  ./install.sh     (settings apply live; code needs try.sh or one logout)"
echo "2. Enable:   gnome-extensions enable dynamic-island@xaminezh.xyz"
echo "3. Clock:    the GNOME date/time stays on the panel; idle island is an empty notch"
echo "4. Calendar: right-click the empty notch"
echo "5. Notify:   notify-send 'Island' 'This should stay a native GNOME banner'"
echo "6. Volume:   use the volume keys — OSD should appear on the island"
echo "7. Media:    art + waves; hover = small pause that toggles; click the media pill expands"
echo "8. Charge:   plug in the laptop"
echo "9. Disable:  gnome-extensions disable dynamic-island@xaminezh.xyz"
echo "   The GNOME clock and stock OSD must come back; banners remain native."
echo

if command -v notify-send >/dev/null; then
    notify-send "Eave" "This notification should remain a native GNOME banner."
fi
