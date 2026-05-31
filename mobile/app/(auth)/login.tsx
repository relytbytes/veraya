import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { useAuthStore } from "@/store/auth";
import { mobileLogin } from "@/lib/api";
import { C, shadow } from "@/lib/theme";

export default function LoginScreen() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  async function handleLogin() {
    if (!email || !password) { setError("Enter your email and password."); return; }
    setLoading(true);
    setError("");
    try {
      const { token, user } = await mobileLogin(email.toLowerCase().trim(), password);
      await setAuth(user, token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.void }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingVertical: 64 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={{ marginBottom: 40, alignItems: "center" }}>
          <View style={{
            width: 84, height: 84, borderRadius: 20,
            backgroundColor: C.void,
            alignItems: "center", justifyContent: "center",
            marginBottom: 16,
            borderWidth: 1, borderColor: C.rim,
            ...shadow.md,
          }}>
            <View style={{
              width: 64, height: 64, borderRadius: 32,
              backgroundColor: C.gold,
              alignItems: "center", justifyContent: "center",
            }}>
              <Text style={{ fontSize: 34, fontWeight: "800", color: C.void, letterSpacing: -1 }}>R</Text>
            </View>
          </View>
          <Text style={{ fontSize: 28, fontWeight: "800", color: C.pearl, letterSpacing: -0.5 }}>Restaurant Ops</Text>
          <Text style={{ color: C.mist, marginTop: 4, fontSize: 15 }}>Staff Portal</Text>
        </View>

        {/* Form */}
        <View style={{ width: "100%", maxWidth: 400, gap: 12 }}>
          {error ? (
            <View style={{
              borderRadius: 12, backgroundColor: "#FFF0EC",
              borderWidth: 1, borderColor: "#F5C6B8",
              paddingHorizontal: 16, paddingVertical: 12,
            }}>
              <Text style={{ color: C.coral, fontSize: 14 }}>{error}</Text>
            </View>
          ) : null}

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>Email</Text>
            <TextInput
              style={{
                backgroundColor: C.surface,
                borderWidth: 1, borderColor: C.rim,
                borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
                fontSize: 16, color: C.pearl,
              }}
              placeholder="staff@restaurant.com"
              placeholderTextColor={C.smoke}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>Password</Text>
            <TextInput
              style={{
                backgroundColor: C.surface,
                borderWidth: 1, borderColor: C.rim,
                borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
                fontSize: 16, color: C.pearl,
              }}
              placeholder="••••••••"
              placeholderTextColor={C.smoke}
              secureTextEntry
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={handleLogin}
            />
          </View>

          <TouchableOpacity
            style={{
              marginTop: 8, borderRadius: 14, paddingVertical: 16,
              alignItems: "center",
              backgroundColor: loading ? C.goldDim : C.gold,
              ...shadow.gold,
            }}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={C.void} />
              : <Text style={{ color: C.void, fontWeight: "700", fontSize: 16 }}>Sign In</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
