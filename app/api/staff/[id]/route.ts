import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";

const SELECT = { id: true, name: true, email: true, role: true, isActive: true, hourlyRate: true, employmentType: true, annualSalary: true, createdAt: true } as const;

// GET /api/staff/[id]  – fetch user detail
export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await props.params;
  const user = await prisma.user.findUnique({ where: { id }, select: SELECT });
  if (!user) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(user);
}

// PATCH /api/staff/[id]  – update name, role, isActive, hourlyRate
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await props.params;
  const body = await req.json();
  const { name, role, isActive, hourlyRate, employmentType, annualSalary } = body as {
    name?: string;
    role?: string;
    isActive?: boolean;
    hourlyRate?: number | null;
    employmentType?: string;
    annualSalary?: number | null;
  };

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(role !== undefined && { role: role as UserRole }),
      ...(isActive !== undefined && { isActive }),
      ...(hourlyRate !== undefined && { hourlyRate: hourlyRate != null ? Number(hourlyRate) : null }),
      ...(employmentType !== undefined && { employmentType }),
      ...(annualSalary !== undefined && { annualSalary: annualSalary != null ? Number(annualSalary) : null }),
    },
    select: SELECT,
  });

  return Response.json(user);
}
