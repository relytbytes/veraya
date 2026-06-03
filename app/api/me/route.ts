import { auth } from "@/lib/auth";

// GET /api/me — the current session user's identity + role, for client
// components that need to gate UI (e.g. admin-only controls) without a
// SessionProvider. Cheap; cached briefly per request.
export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user as { id?: string; name?: string; email?: string; role?: string } | undefined;
  return Response.json({
    id: u?.id ?? null,
    name: u?.name ?? null,
    email: u?.email ?? null,
    role: u?.role ?? "SERVER",
  });
}
