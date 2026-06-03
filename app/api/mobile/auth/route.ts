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

    // NextAuth v5 names the session cookie differently over HTTPS: it adds the
    // `__Secure-` prefix and uses that exact name as the JWT's HKDF salt. The
    // mobile client sets the cookie by hand, so the token MUST be encoded with
    // the salt matching the cookie name we tell it to send — otherwise the
    // server can't decode it and every protected route 401s. Derive both from
    // the request protocol so it's correct on Vercel (https) and local (http).
    const isHttps = req.headers.get("x-forwarded-proto") === "https";
    const cookieName = isHttps ? "__Secure-authjs.session-token" : "authjs.session-token";
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
      salt: cookieName,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return Response.json({
      token,
      cookieName,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (e) {
    console.error("[POST /api/mobile/auth]", e);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
