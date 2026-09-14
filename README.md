<p align="center">
  <img src="brand/eave-mark.svg#gh-light-mode-only" alt="Eave" width="180">
  <img src="brand/eave-mark-white.svg#gh-dark-mode-only" alt="Eave" width="180">
</p>

# Eave

A recess at the top of the desktop. GNOME Dynamic Island for Fedora.

Standalone top-center overlay in GNOME Shell (not the date menu, not a panel media widget). It morphs for media, volume, brightness, charging, Bluetooth, and privacy. Notifications stay in GNOME's native banners.

The GNOME UUID is still `dynamic-island@xaminezh.xyz`, so existing Fedora installs keep working. Settings schema keys are unchanged.

Marketing site (static): [`site/index.html`](site/index.html).

This is a **GNOME Shell extension**, not an Electron overlay and not a Hyprland layer-shell widget. Mutter has no `wlr-layer-shell`, so the only way the island can sit in the panel on Fedora Wayland is inside the Shell itself.

**Target:** Fedora 44 (GNOME 50), also GNOME 49 and 51 (Fedora 43 / 45).

## Install on Fedora

```bash
sudo dnf install gnome-extensions-app glib2 make zip
git clone https://github.com/XaMiNeZH/eave.git
cd eave
./install.sh
```

Settings (alignment, clock, timeouts) apply as soon as you change them. **You do not need to log out for that.**

Wayland cannot reload extension *code* inside the running Shell. Do not log out for every tweak. Open a nested GNOME window instead. Your current session and apps stay open:

```bash
sudo dnf install mutter-devkit   # once, GNOME 49+
./tools/try.sh
```

If the island is missing inside that window, enable it there:

```bash
gnome-extensions enable dynamic-island@xaminezh.xyz
```

Log out of the real session only when you want the new code on the host desktop.

Uninstall:

```bash
./uninstall.sh
```

Notifications always use GNOME's native banners. Disabling the extension restores the stock OSD and any panel media-controls widget the island hid. The GNOME date and time are never taken over.

## On main

What `main` ships today:

| State | What you see |
| --- | --- |
| Idle | Small empty black notch; tap for a bounce, right-click for calendar |
| Media (compact) | Album art (or the player icon) and sound waves |
| Media (hover) | Same compact pill, small filled play/pause that actually toggles |
| Media (expanded) | Click opens a 344×84 now-playing panel: album art, clipped marquee title/artist, art-tinted waveform, inline seek times, capsule scrubber, and transport controls |
| Volume / brightness / mute | Thick-capsule HUD in the island (not the stock GNOME OSD) |
| Charging | Percentage when you plug in |
| Bluetooth | Device name on connect |
| Recording / mic | Persistent compact activity while in use |

The panel date/time stays where GNOME put it. Right-click the idle notch to open the calendar. Other MPRIS panel widgets (such as media-controls) are hidden by default so they do not sit behind the island.

A later release can add a hybrid dashboard. v1 is live activities and transients only, no weather/notes hub.

Compact and expanded media tint the six-bar waveform from album art. Bars grow from the center (silence is a row of dots). GNOME has no per-app audio tap, so the motion on `main` is procedural rather than a live FFT.

## Open PRs (not on main)

These extras are in open pull requests. They are not on `main`. Treat them as untested until they merge.

- Compact Focus/DND and privacy pills ([#5](https://github.com/XaMiNeZH/eave/pull/5))
- Real Gvc output sink picker ([#6](https://github.com/XaMiNeZH/eave/pull/6))
- Swipe to dismiss OSD or collapse media ([#7](https://github.com/XaMiNeZH/eave/pull/7))
- Compact pill for GNOME Calls ([#8](https://github.com/XaMiNeZH/eave/pull/8))
- OSD level fill alignment and 100% width ([#9](https://github.com/XaMiNeZH/eave/pull/9))
- Compact Bluetooth, privacy, and recording pills ([#10](https://github.com/XaMiNeZH/eave/pull/10))
- Optional live PipeWire waveform with procedural fallback ([#11](https://github.com/XaMiNeZH/eave/pull/11))
- Clip long media titles inside the island ([#12](https://github.com/XaMiNeZH/eave/pull/12))
- Keep the island on the unlock dialog ([#13](https://github.com/XaMiNeZH/eave/pull/13))
- Restore media volume without collapsing the island ([#14](https://github.com/XaMiNeZH/eave/pull/14))
- Screenshot started pill ([#15](https://github.com/XaMiNeZH/eave/pull/15))
- Airplane and Wi-Fi connecting pills ([#16](https://github.com/XaMiNeZH/eave/pull/16))
- Power profile change pill ([#17](https://github.com/XaMiNeZH/eave/pull/17))
- Night Light on/off pill ([#18](https://github.com/XaMiNeZH/eave/pull/18))
- Compact low-battery warning pill ([#19](https://github.com/XaMiNeZH/eave/pull/19))
- Review fixes for main (OSD classify, clip, recording tap) ([#20](https://github.com/XaMiNeZH/eave/pull/20))
- VPN connected pill ([#21](https://github.com/XaMiNeZH/eave/pull/21))
- Eave rename and landing page ([#22](https://github.com/XaMiNeZH/eave/pull/22))

## Preferences

Open **Extensions → Eave → Settings** (or `gnome-extensions prefs dynamic-island@xaminezh.xyz`):

- OSD takeover (notifications stay native)
- Hide panel media-controls (date menu stays)
- Per-activity toggles
- Morph duration and hold times
- Clock format (unused on the idle notch; kept for later)
- Alignment: bar inset and a vertical nudge (live, no logout)

## Development

```bash
make check    # schemas + headless gjs tests
make zip      # pack dynamic-island@xaminezh.xyz.shell-extension.zip
./tools/try.sh  # nested GNOME window; no logout
```

GJS caches extension modules for the life of the `gnome-shell` process. `disable` / `enable` re-runs `enable()` but does **not** pick up file edits. A nested window (`./tools/try.sh`) is a new process, so it loads the files you just installed.

After `./tools/try.sh`, confirm: the panel date/time is still there, media-controls is not peeking through the notch, native notification banners appear normally, compact media is art + a 6-bar waveform, hover pause is a **filled** mark that toggles playback, and clicking the media pill expands a 344×84 **rounded rectangle** (22px corners) with album art, clipped marquee text, inline seek times, a live capsule seek rail, and filled transport controls. No square shadow or halo may appear around the pill.

Typography uses **SF Pro Display** (titles) and **SF Pro Text** (times, HUD, artist) when fontconfig can see them, otherwise bundled **Inter**. Check the names your copy registered:

```bash
fc-list : family | grep -i 'sf pro'
```

Then open a **new** nested Shell (`./tools/try.sh`). `disable` / `enable` will not pick up a newly installed font in the current process. Optional system fallback: `sudo dnf install google-inter-fonts`.

### Cloud Agent visual smoke test

The Cloud Agent has no host Wayland session, GPU, KMS device, or systemd-logind, so it cannot run the Fedora `mutter-devkit` workflow directly. Its configured test environment instead runs a real software-rendered compositor chain:

```text
Xvfb → Weston (Pixman) → nested GNOME Shell/Mutter
```

Run the isolated smoke test and inspect the saved screenshot:

```bash
./tools/cloud-try.sh /tmp/dynamic-island-visual
```

It writes `nested-shell.png`, the Shell log, and extension state to that directory; it does not change the repository metadata or your desktop settings. Ubuntu 24.04 provides GNOME 46, while this extension targets GNOME 49 to 51, so the script adds `46` **only to its temporary extension copy** to exercise the actual `St`/`Clutter` visual path. This is a compositor and rendering smoke test, not GNOME 50 compatibility validation. Test media, hardware OSD, BlueZ, UPower, and the final target versions on Fedora GNOME as well.

The regular headless tests cover the activity stack, motion math, geometry fit, panel-media matching, and clock/OSD classification.

## Why not the other islands

Projects built for Hyprland/Quickshell look like an Apple Dynamic Island but do not attach to GNOME. Electron/GTK windows cannot live in the GNOME panel on Wayland. Dashboard-style GNOME notches (weather, notes, file shelves) are a different product. This extension stays in-process, uses `St`/`Clutter`, and talks to `MessageTray`, MPRIS, UPower, BlueZ, and `osdWindowManager` directly.

## License

GPL-3.0-or-later. GNOME Shell extensions that import `resource:///org/gnome/shell/` must be GPL-compatible.
