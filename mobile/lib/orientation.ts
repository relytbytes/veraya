// expo-screen-orientation is a NATIVE module. If the JS bundle (e.g. an OTA
// update) is newer than the installed native binary, the module can be absent —
// and modern expo modules throw at *import* time when their native side is
// missing. Load it defensively so the app still runs; orientation locking just
// becomes a no-op on that build.
let SO: typeof import("expo-screen-orientation") | null = null;
try {
  // Static string so Metro bundles it; try/catch handles the native-missing throw.
  SO = require("expo-screen-orientation");
} catch {
  SO = null;
}

export const orientationAvailable = !!SO;

export function lockPortrait() {
  try { SO?.lockAsync(SO.OrientationLock.PORTRAIT_UP)?.catch(() => {}); } catch { /* native module absent */ }
}

export function lockLandscape() {
  try { SO?.lockAsync(SO.OrientationLock.LANDSCAPE)?.catch(() => {}); } catch { /* native module absent */ }
}
