// @react-native-community/netinfo is a NATIVE module. If the JS bundle is newer
// than the installed native binary (OTA shipped a native dep before this device
// was rebuilt), RNCNetInfo is null and calling it throws. Load + call it
// defensively; if it's unavailable we just assume "online" so nothing breaks.
let NetInfo: { addEventListener: (cb: (s: { isConnected: boolean | null }) => void) => () => void } | null = null;
try {
  NetInfo = require("@react-native-community/netinfo").default;
} catch {
  NetInfo = null;
}

export const connectivityAvailable = !!NetInfo;

/**
 * Subscribe to connectivity changes. Calls `cb(online)` on every change.
 * Returns an unsubscribe fn. No-ops (and reports online) if netinfo is absent.
 */
export function addConnectivityListener(cb: (online: boolean) => void): () => void {
  if (!NetInfo) return () => {};
  try {
    return NetInfo.addEventListener((state) => cb(state.isConnected !== false));
  } catch {
    return () => {};
  }
}
