import { useEffect, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { C } from "@/lib/theme";

/**
 * Thin top strip shown whenever the device loses connectivity. React Query is
 * already wired to NetInfo (onlineManager) so it pauses/auto-resumes fetches;
 * this just tells the user why the screen isn't updating.
 */
export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      // isConnected can be null briefly on launch — treat null as online.
      setOffline(state.isConnected === false);
    });
  }, []);

  useEffect(() => {
    Animated.timing(anim, { toValue: offline ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [offline, anim]);

  if (!offline) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 9999,
        paddingTop: insets.top + 4, paddingBottom: 8, paddingHorizontal: 16,
        backgroundColor: C.coral,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
      }}
    >
      <Ionicons name="cloud-offline-outline" size={15} color="#fff" />
      <Text style={{ color: "#fff", fontSize: 12.5, fontWeight: "700" }}>No connection — showing last synced data</Text>
    </Animated.View>
  );
}
