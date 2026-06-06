import React, { useRef, useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { CameraView, Camera } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
  hint?: string;
}

export function PhotoCapture({
  onCapture,
  onClose,
  hint = "Point at the product and tap the button",
}: Props) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    Camera.requestCameraPermissionsAsync().then(({ status }) => {
      setHasPermission(status === "granted");
    });
  }, []);

  async function handleCapture() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.85, // sharper text so the AI can read fine print (vintage, vineyard)
        exif: false,
      });
      if (photo?.base64) {
        onCapture(`data:image/jpeg;base64,${photo.base64}`);
      }
    } catch (e) {
      console.error("Photo capture error:", e);
    } finally {
      setCapturing(false);
    }
  }

  if (hasPermission === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#f59e0b" size="large" />
        <Text style={styles.hint}>Requesting camera permission…</Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Ionicons name="camera-outline" size={48} color="#6b7280" />
        <Text style={styles.hint}>Camera access denied.{"\n"}Enable it in Settings.</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeTxt}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color="white" />
          </TouchableOpacity>
          <Text style={styles.title}>AI Identify</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Center guide */}
        <View style={styles.centerGuide}>
          <View style={styles.guideBox}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
          </View>
        </View>

        {/* Bottom controls */}
        <View style={styles.bottom}>
          <Text style={styles.hint}>{hint}</Text>
          <TouchableOpacity
            style={[styles.captureBtn, capturing && styles.captureBtnDisabled]}
            onPress={handleCapture}
            disabled={capturing}
          >
            {capturing ? (
              <ActivityIndicator color="#f59e0b" size="large" />
            ) : (
              <View style={styles.captureBtnInner} />
            )}
          </TouchableOpacity>
          <Text style={styles.subHint}>Powered by AI vision</Text>
        </View>
      </View>
    </View>
  );
}

const CORNER_SIZE = 24;

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    padding: 24,
    gap: 16,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  topBar: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  centerGuide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  guideBox: {
    width: 240,
    height: 240,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: "#f59e0b",
    borderWidth: 3,
  },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  bottom: {
    paddingBottom: 56,
    paddingTop: 20,
    alignItems: "center",
    gap: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  hint: {
    color: "#fff",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  subHint: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    textAlign: "center",
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "white",
  },
  captureBtnDisabled: {
    opacity: 0.6,
  },
  captureBtnInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "white",
  },
  closeBtn: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  closeTxt: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
