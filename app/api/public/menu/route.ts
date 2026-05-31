import { prisma } from "@/lib/prisma";

export async function GET() {
  const [categories, eightySixed] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: {
        menuItems: {
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            prepTime: true,
            imageUrl: true,
          },
        },
      },
    }),
    prisma.eightySixItem.findMany({ select: { menuItemId: true } }),
  ]);

  // Fetch 86'd item IDs
  const eightySixedIds = new Set(eightySixed.map((e) => e.menuItemId));

  // After fetching categories, filter out 86'd items from each category
  const filtered = categories.map((cat) => ({
    ...cat,
    menuItems: cat.menuItems.filter((item) => !eightySixedIds.has(item.id)),
  }));
  return Response.json(filtered);
}
