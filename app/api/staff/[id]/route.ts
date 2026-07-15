import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { UserRole } from "@/app/generated/prisma/enums";
import bcrypt from "bcryptjs";

const SELECT = { id: true, name: true, email: true, role: true, isActive: true, hourlyRate: true, employmentType: true, annualSalary: true, createdAt: true } as const;

const SELECT_BASIC = { id: true, name: true, role: true, isActive: true, createdAt: true } as const;

// GET /api/staff/[id]  – fetch user detail
export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const callerRole = (session.user as { role?: string })?.role ?? "";
  const isManager = ["ADMIN", "MANAGER"].includes(callerRole);
  const callerId = (session.user as { id?: string })?.id ?? "";

  const { id } = await props.params;

  // Non-managers can only fetch their own record (stripped of compensation)
  if (!isManager && callerId !== id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id }, select: isManager ? SELECT : SELECT_BASIC });
  if (!user) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(user);
}

// PATCH /api/staff/[id]  – update name, role, isActive, hourlyRate
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const callerRole = (session.user as { role?: string })?.role ?? "";
  const callerId = (session.user as { id?: string })?.id ?? "";
  const isManager = ["ADMIN", "MANAGER"].includes(callerRole);

  const { id } = await props.params;
  const body = await req.json();
  const { name, role, isActive, hourlyRate, employmentType, annualSalary, managerPin } = body as {
    name?: string;
    role?: string;
    isActive?: boolean;
    hourlyRate?: number | null;
    employmentType?: string;
    annualSalary?: number | null;
    managerPin?: string | null;
  };

  // Privileged fields (role, pay, active status) require manager auth.
  const wantsPrivileged = role !== undefined || isActive !== undefined ||
    hourlyRate !== undefined || annualSalary !== undefined || employmentType !== undefined;
  if (wantsPrivileged && !isManager) {
    return Response.json({ error: "Only managers can change roles, pay, or active status." }, { status: 403 });
  }
  // Non-admins cannot elevate to ADMIN.
  if (role === "ADMIN" && callerRole !== "ADMIN") {
    return Response.json({ error: "Only admins can assign the admin role." }, { status: 403 });
  }
  // Non-managers can only update their own name.
  if (!isManager && callerId !== id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const data: Record<string, unknown> = {
    ...(name !== undefined && { name }),
    ...(role !== undefined && { role: role as UserRole }),
    ...(isActive !== undefined && { isActive }),
    ...(hourlyRate !== undefined && { hourlyRate: hourlyRate != null ? Number(hourlyRate) : null }),
    ...(employmentType !== undefined && { employmentType }),
    ...(annualSalary !== undefined && { annualSalary: annualSalary != null ? Number(annualSalary) : null }),
  };

  // Manager override PIN — only ADMIN/MANAGER may set one, and only on a
  // MANAGER/ADMIN account. Stored as a bcrypt hash; empty clears it.
  if (managerPin !== undefined) {
    const editorRole = (session.user as { role?: string })?.role ?? "";
    if (!["ADMIN", "MANAGER"].includes(editorRole)) {
      return Response.json({ error: "Only a manager can set override PINs." }, { status: 403 });
    }
    const pin = (managerPin ?? "").trim();
    if (pin && !/^\d{4,6}$/.test(pin)) {
      return Response.json({ error: "PIN must be 4 to 6 digits." }, { status: 400 });
    }
    data.managerPin = pin ? await bcrypt.hash(pin, 10) : null;
  }

  const user = await prisma.user.update({ where: { id }, data, select: SELECT });

  return Response.json(user);
}
