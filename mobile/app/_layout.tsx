import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { useAuthStore } from "@/store/auth";
import { C } from "@/lib/theme";
import "../global.css";

// Hold the splash screen until auth state is hydrated — prevents the bare
// React screen from flashing before the login redirect fires.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

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
