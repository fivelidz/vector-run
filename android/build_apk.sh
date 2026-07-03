#!/usr/bin/env bash
# build_apk.sh — sync the web game into the APK assets, build, and install on the
# connected Redmi (auto-taps the MIUI install dialog if it appears).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"          # android/
ROOT="$(cd "$HERE/.." && pwd)"                 # vector_run/
DST="$HERE/app/src/main/assets/game"

echo "▶ Syncing game assets -> $DST"
mkdir -p "$DST"
rsync -a --delete \
  --exclude 'assets/audio/unsorted' \
  --exclude 'assets/models/_meshy_state.json' \
  "$ROOT/index.html" "$ROOT/css" "$ROOT/src" "$ROOT/vendor" "$DST/" 2>/dev/null || {
    # rsync of individual files+dirs: do it explicitly
    cp "$ROOT/index.html" "$DST/"
    rsync -a --delete "$ROOT/css/" "$DST/css/"
    rsync -a --delete "$ROOT/src/" "$DST/src/"
    rsync -a --delete "$ROOT/vendor/" "$DST/vendor/"
  }
mkdir -p "$DST/assets"
rsync -a --delete "$ROOT/assets/models/" "$DST/assets/models/" --exclude '_meshy_state.json'
rsync -a --delete "$ROOT/assets/audio/"  "$DST/assets/audio/"  --exclude 'unsorted'

echo "▶ Building debug APK"
cd "$HERE"
./gradlew :app:assembleDebug --no-daemon -q
APK="$HERE/app/build/outputs/apk/debug/app-debug.apk"
echo "   built: $APK ($(du -h "$APK" | cut -f1))"

if adb get-state >/dev/null 2>&1; then
  echo "▶ Installing on device"
  adb push "$APK" /data/local/tmp/vr.apk >/dev/null
  adb shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
  (adb shell "pm install -r -t /data/local/tmp/vr.apk" 2>&1; echo "RESULT:$?") > /tmp/vr_install.log &
  sleep 2
  # auto-tap the MIUI "Install" dialog (coords for 1080x2400 Redmi Note 14 5G)
  adb shell input tap 539 1976 >/dev/null 2>&1 || true   # Remember my choice
  sleep 0.3
  adb shell input tap 310 2103 >/dev/null 2>&1 || true   # Install
  sleep 3
  cat /tmp/vr_install.log
  adb shell monkey -p com.fivelidz.vectorrun -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
  echo "▶ Launched Vector Run"
else
  echo "!! No device connected — skipped install. APK at: $APK"
fi
