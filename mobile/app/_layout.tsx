import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { useAuthStore } from "@/store/auth";
import { C } from "@/lib/theme";
import "../global.css";

// Hold the splash screen until auth state is hydrated — prevents the bare
// React screen from flashing before the login redirect fires.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't retry an expired/invalid session — it can't succeed and only
      // delays the bounce to login. Retry other transient failures once.
      retry: (failureCount, error) =>
        !(error instanceof Error && /session expired|HTTP 401/i.test(error.message)) && failureCount < 1,
    },
  },
});

// Bridge React Query's focus tracking to React Native AppState so queries
// refetch the moment the app returns to the foreground — this (plus the SSE
// reconnect catch-up) is what lets us run a slow background poll instead of a
// fast one. Without it, RN never fires "focus" refetches.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener("change", (status: AppStateStatus) => {
    handleFocus(status === "active");
  });
  return () => sub.remove();
});

function AuthGuard() {
  const { user, hydrated } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!hydrated) return;
    // Auth state is known — hide splash and redirect
    SplashScreen.hideAsync();
    const inAuth = segments[0] === "(auth)";
    if (!user && !inAuth) router.replace("/(auth)/login");
    if (user && inAuth) router.replace("/(app)");
  }, [user, hydrated, segments, router]);

  return null;
}

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.void }}>
      <QueryClientProvider client={queryClient}>
        <AuthGuard />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.void } }} />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
