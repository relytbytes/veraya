import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";

const adapter = new PrismaLibSql({ url: "file:/Users/ty/restaurant-ops/prisma/dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // Admin user
  const adminPassword = await bcrypt.hash("admin123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@restaurant.com" },
    update: {},
    create: {
      name: "Admin User",
      email: "admin@restaurant.com",
      password: adminPassword,
      role: "ADMIN",
    },
  });
  console.log("✓ Admin user:", admin.email);

  // Categories
  const categories = await Promise.all([
    prisma.category.upsert({ where: { id: "cat-appetizers" }, update: {}, create: { id: "cat-appetizers", name: "Appetizers", sortOrder: 1 } }),
    prisma.category.upsert({ where: { id: "cat-mains" }, update: {}, create: { id: "cat-mains", name: "Main Courses", sortOrder: 2 } }),
    prisma.category.upsert({ where: { id: "cat-sides" }, update: {}, create: { id: "cat-sides", name: "Sides", sortOrder: 3 } }),
    prisma.category.upsert({ where: { id: "cat-desserts" }, update: {}, create: { id: "cat-desserts", name: "Desserts", sortOrder: 4 } }),
    prisma.category.upsert({ where: { id: "cat-drinks" }, update: {}, create: { id: "cat-drinks", name: "Beverages", sortOrder: 5 } }),
  ]);
  console.log("✓ Categories:", categories.length);

  // Supplier
  const supplier = await prisma.supplier.upsert({
    where: { id: "supp-fresh-farms" },
    update: {},
    create: {
      id: "supp-fresh-farms",
      name: "Fresh Farms Co.",
      contactName: "Mike Johnson",
      email: "mike@freshfarms.com",
      phone: "(555) 123-4567",
    },
  });

  // Ingredients with inventory
  const ingredientData = [
    { id: "ing-chicken", name: "Chicken Breast", unit: "lb", costPerUnit: 4.5, min: 10 },
    { id: "ing-salmon", name: "Salmon Fillet", unit: "lb", costPerUnit: 12.0, min: 5 },
    { id: "ing-pasta", name: "Pasta (dry)", unit: "lb", costPerUnit: 1.2, min: 20 },
    { id: "ing-tomato", name: "Tomatoes", unit: "lb", costPerUnit: 2.0, min: 15 },
    { id: "ing-lettuce", name: "Romaine Lettuce", unit: "head", costPerUnit: 1.5, min: 10 },
    { id: "ing-cheese", name: "Parmesan Cheese", unit: "lb", costPerUnit: 8.0, min: 5 },
    { id: "ing-butter", name: "Butter", unit: "lb", costPerUnit: 5.0, min: 5 },
    { id: "ing-garlic", name: "Garlic", unit: "lb", costPerUnit: 3.0, min: 3 },
    { id: "ing-bread", name: "Bread (loaf)", unit: "loaf", costPerUnit: 3.5, min: 5 },
    { id: "ing-cream", name: "Heavy Cream", unit: "L", costPerUnit: 4.0, min: 3 },
  ];

  for (const ing of ingredientData) {
    await prisma.ingredient.upsert({
      where: { id: ing.id },
      update: {},
      create: {
        id: ing.id,
        name: ing.name,
        unit: ing.unit,
        costPerUnit: ing.costPerUnit,
        supplierId: supplier.id,
        inventoryItem: {
          create: {
            quantity: ing.min * 3,
            minThreshold: ing.min,
          },
        },
      },
    });
  }
  console.log("✓ Ingredients:", ingredientData.length);

  // Menu Items
  const menuItems = [
    { id: "item-caesar", name: "Caesar Salad", desc: "Crisp romaine, parmesan, croutons", price: 12.0, catId: "cat-appetizers" },
    { id: "item-soup", name: "Soup of the Day", desc: "Ask your server", price: 8.0, catId: "cat-appetizers" },
    { id: "item-garlic-bread", name: "Garlic Bread", desc: "Toasted with herb butter", price: 6.0, catId: "cat-appetizers" },
    { id: "item-chicken", name: "Grilled Chicken", desc: "Pan-seared with herb butter and seasonal veg", price: 24.0, catId: "cat-mains", prepTime: 20 },
    { id: "item-salmon", name: "Pan-Seared Salmon", desc: "Atlantic salmon, lemon butter, asparagus", price: 32.0, catId: "cat-mains", prepTime: 18 },
    { id: "item-pasta", name: "Pasta Arrabiata", desc: "Penne, spicy tomato sauce, parmesan", price: 18.0, catId: "cat-mains", prepTime: 15 },
    { id: "item-fries", name: "Crispy Fries", desc: "Sea salt and herbs", price: 7.0, catId: "cat-sides" },
    { id: "item-salad-side", name: "Side Salad", desc: "Mixed greens, house vinaigrette", price: 6.0, catId: "cat-sides" },
    { id: "item-cake", name: "Chocolate Lava Cake", desc: "Warm, with vanilla ice cream", price: 10.0, catId: "cat-desserts", prepTime: 12 },
    { id: "item-coke", name: "Soft Drink", desc: "Coke, Diet Coke, Sprite, Lemonade", price: 3.5, catId: "cat-drinks" },
    { id: "item-water", name: "Sparkling Water", desc: "San Pellegrino", price: 4.0, catId: "cat-drinks" },
    { id: "item-coffee", name: "Coffee", desc: "Drip coffee, freshly brewed", price: 3.0, catId: "cat-drinks" },
  ];

  for (const item of menuItems) {
    await prisma.menuItem.upsert({
      where: { id: item.id },
      update: {},
      create: {
        id: item.id,
        name: item.name,
        description: item.desc,
        price: item.price,
        categoryId: item.catId,
        prepTime: item.prepTime ?? null,
      },
    });
  }
  console.log("✓ Menu items:", menuItems.length);

  // Tables
  for (let i = 1; i <= 10; i++) {
    await prisma.table.upsert({
      where: { number: i },
      update: {},
      create: { number: i, capacity: i <= 4 ? 2 : i <= 8 ? 4 : 6 },
    });
  }
  console.log("✓ Tables: 10");

  console.log("\nSeed complete! Login with: admin@restaurant.com / admin123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
