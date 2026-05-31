/**
 * SwipeSheet — bottom-sheet wrapper with swipe-to-dismiss.
 *
 * Drop-in replacement for the inner content of a transparent Modal that is
 * aligned to the bottom of the screen.  Renders a drag handle pill at the top
 * and wraps children in an Animated.View that translates down while the user
 * drags and dismisses (calls `onClose`) when they release past the threshold.
 *
 * Usage:
 *   <Modal transparent animationType="slide" onRequestClose={onClose}>
 *     <Pressable style={styles.backdrop} onPress={onClose}>
 *       <SwipeSheet onClose={onClose}>
 *         {... sheet content ...}
 *       </SwipeSheet>
 *     </Pressable>
 *   </Modal>
 */

import { useRef, useEffect } from "react";
import { View, Animated, PanResponder } from "react-native";
import { C } from "@/lib/theme";

interface SwipeSheetProps {
  onClose: () => void;
  /** Extra bottom padding in addition to the default 32 */
  extraPad?: number;
  children: React.ReactNode;
  style?: object;
}

export function SwipeSheet({ onClose, children, style, extraPad = 0 }: SwipeSheetProps) {
  const translateY = useRef(new Animated.Value(0)).current;

  // Reset position whenever the sheet mounts / becomes visible
  useEffect(() => {
    translateY.setValue(0);
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      // Only activate for downward drags initiated on the handle area.
      // We check dy > 0 so upward scrolls inside the sheet are not intercepted.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 4,
      onPanResponderMove: (_, { dy }) => {
        // Only allow dragging downward (positive dy)
        if (dy > 0) translateY.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        // Dismiss if dragged > 80 dp or flicked fast (vy > 0.8 dp/ms)
        if (dy > 80 || vy > 0.8) {
          // Animate to off-screen then call onClose
          Animated.timing(translateY, {
            toValue: 600,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            translateY.setValue(0); // reset for next open
            onClose();
          });
        } else {
          // Snap back
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        {
          backgroundColor: C.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderTopWidth: 1,
          borderColor: C.rim,
          paddingBottom: 32 + extraPad,
          transform: [{ translateY }],
        },
        style,
      ]}
    >
      {/* Drag handle — PanResponder lives here so scroll inside sheet still works */}
      <View
        {...panResponder.panHandlers}
        style={{ paddingTop: 12, paddingBottom: 8, alignItems: "center" }}
      >
        <View
          style={{
            width: 40,
            height: 4,
            backgroundColor: C.rim,
            borderRadius: 2,
          }}
        />
      </View>
      {children}
    </Animated.View>
  );
}
