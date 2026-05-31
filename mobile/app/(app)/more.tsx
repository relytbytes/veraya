import { Redirect } from "expo-router";

// Content moved to the Home screen (index.tsx).
// This redirect ensures any saved navigation state that still points here
// gets bounced to the home tab rather than rendering a blank/stale screen.
export default function MoreRedirect() {
  return <Redirect href="/(app)" />;
}
