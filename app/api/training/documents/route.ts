import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { STANDARD_MANUALS } from "@/lib/training-manuals";

// GET /api/training/documents — the standardized built-in manuals plus any
// custom TrainingDocument rows. Every venue gets a professional baseline that
// opens in the web app (the prior gap: empty / unopenable manuals).
export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let custom: { id: string; title: string; summary: string; category: string; roles: string[]; content: string; builtIn: boolean }[] = [];
  try {
    const rows = await prisma.trainingDocument.findMany({ where: { isActive: true }, orderBy: { title: "asc" } });
    custom = rows
      .filter((r) => (r.content && r.content.trim()) || r.url)
      .map((r) => ({
        id: r.id,
        title: r.title,
        summary: r.description ?? "",
        category: "Systems",
        roles: r.roles ? r.roles.split(",").map((s) => s.trim()).filter(Boolean) : [],
        content: r.content ?? (r.url ? `[Open document](${r.url})` : ""),
        builtIn: false,
      }));
  } catch { /* table may be empty — built-ins still return */ }

  return Response.json([...STANDARD_MANUALS, ...custom]);
}
