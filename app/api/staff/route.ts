import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { UserRole } from "@/app/generated/prisma/enums";

const SELECT = { id: true, name: true, email: true, role: true, isActive: true, hourlyRate: true, employmentType: true, annualSalary: true, createdAt: true } as const;

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const staff = await prisma.user.findMany({ select: SELECT, orderBy: { name: "asc" } });
  return Response.json(staff);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, email, password, role, hourlyRate, employmentType, annualSalary } = body;

  if (!name || !email || !password) {
    return Response.json({ error: "Name, email, and password are required" }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return Response.json({ error: "Email already in use" }, { status: 400 });

  const hashed = await bcrypt.hash(password, 12);
  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        role: (role as UserRole) ?? "SERVER",
        hourlyRate: hourlyRate ? Number(hourlyRate) : null,
        employmentType: employmentType ?? "HOURLY",
        annualSalary: annualSalary ? Number(annualSalary) : null,
      },
      select: SELECT,
    });
    return Response.json(user, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint") || msg.includes("unique") || msg.includes("UNIQUE")) {
      return Response.json({ error: "Email already in use" }, { status: 400 });
    }
    throw err;
  }
}
