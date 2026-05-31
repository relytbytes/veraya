import { useRef } from "react";
import { Animated, View, Text } from "react-native";
import { C } from "@/lib/theme";

interface CollapsingHeaderProps {
  title: string;
  subtitle?: string;
  scrollY: Animated.Value;
  left?: React.ReactNode;
  right?: React.ReactNode;
}

export function CollapsingHeader({ title, subtitle, scrollY, left, right }: CollapsingHeaderProps) {
  const tallHeight = subtitle ? 76 : 52;
  const headerHeight = scrollY.interpolate({ inputRange: [0, 48], outputRange: [tallHeight, 52], extrapolate: "clamp" });
  const largeTitleOpacity = scrollY.interpolate({ inputRange: [0, 24], outputRange: [1, 0], extrapolate: "clamp" });
  const compactTitleOpacity = scrollY.interpolate({ inputRange: [24, 48], outputRange: [0, 1], extrapolate: "clamp" });

  return (
    <Animated.View style={{
      height: headerHeight,
      backgroundColor: C.surface,
      borderBottomWidth: 1,
      borderBottomColor: C.rim,
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 12,
      paddingRight: 16,
      gap: 8,
      overflow: "hidden",
    }}>
      {left}

      {/* Title slot — stretches full height so absolute children can center themselves */}
      <View style={{ flex: 1, alignSelf: "stretch" }}>
        {/* Large title (fades out on scroll) */}
        <Animated.View style={{
          opacity: largeTitleOpacity,
          position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
          justifyContent: "center",
        }}>
          <Text style={{ fontSize: subtitle ? 22 : 20, fontWeight: "700", color: C.pearl }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={{ fontSize: 12, color: C.mist, marginTop: 2 }} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </Animated.View>

        {/* Compact title (fades in on scroll) */}
        <Animated.View style={{
          opacity: compactTitleOpacity,
          position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
          justifyContent: "center",
        }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: C.pearl }} numberOfLines={1}>
            {title}
          </Text>
        </Animated.View>
      </View>

      {right}
    </Animated.View>
  );
}

export function useCollapsingHeader() {
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollHandler = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false },
  );
  return { scrollY, scrollHandler };
}
