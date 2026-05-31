import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { CameraView, Camera, BarcodeScanningResult } from "expo-camera";

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
  hint?: string;
}

const { width } = Dimensions.get("window");
const FRAME = width * 0.7;

export function Scanner({ onScan, onClose, hint = "Align barcode in the frame" }: Props) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const cooldown = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Camera.requestCameraPermissionsAsync().then(({ status }) => {
      setHasPermission(status === "granted");
    });
    return () => { if (cooldown.current) clearTimeout(cooldown.current); };
  }, []);

  function handleBarcode({ data }: BarcodeScanningResult) {
    if (scanned) return;
    setScanned(true);
    onScan(data);
    // Allow rescan after 2s
    cooldown.current = setTimeout(() => setScanned(false), 2000);
  }

  if (hasPermission === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Requesting camera permission…</Text>
      </View>
    );
  }
  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Camera access denied. Enable it in Settings.</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeTxt}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        onBarcodeScanned={scanned ? undefined : handleBarcode}
        barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "ean8", "upc_a", "upc_e", "code128", "code39"] }}
      />
      {/* Dark overlay with cut-out frame */}
      <View style={styles.overlay}>
        <View style={styles.topDim} />
        <View style={styles.middle}>
          <View style={styles.sideDim} />
          <View style={[styles.frame, scanned && styles.frameScanned]}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
          </View>
          <View style={styles.sideDim} />
        </View>
        <View style={styles.bottomDim}>
          <Text style={styles.hint}>{scanned ? "✓ Scanned!" : hint}</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const DIM = "rgba(0,0,0,0.6)";
const CORNER = 24;

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000", padding: 24 },
  overlay: { ...StyleSheet.absoluteFillObject },
  topDim: { flex: 1, backgroundColor: DIM },
  middle: { height: FRAME, flexDirection: "row" },
  sideDim: { flex: 1, backgroundColor: DIM },
  bottomDim: { flex: 1, backgroundColor: DIM, alignItems: "center", justifyContent: "flex-start", paddingTop: 20, gap: 16 },
  frame: { width: FRAME, height: FRAME, borderColor: "transparent" },
  frameScanned: { backgroundColor: "rgba(16,185,129,0.15)" },
  corner: { position: "absolute", width: CORNER, height: CORNER, borderColor: "#f59e0b", borderWidth: 3 },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  hint: { color: "#fff", fontSize: 14, textAlign: "center", paddingHorizontal: 24 },
  closeBtn: { backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  closeTxt: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
