import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { encode } from "next-auth/jwt";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json() as { email: string; password: string };
    if (!email || !password) {
      return Response.json({ error: "Email and password required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Encode a NextAuth v5-compatible JWT so the mobile app can use existing API routes
    // NextAuth v5 requires a `salt` (HKDF salt) — use the standard session cookie name as salt
    const secret = process.env.NEXTAUTH_SECRET ?? "dev-secret";
    const token = await encode({
      token: {
        sub: user.id,
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      secret,
      salt: "authjs.session-token",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return Response.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (e) {
    console.error("[POST /api/mobile/auth]", e);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
