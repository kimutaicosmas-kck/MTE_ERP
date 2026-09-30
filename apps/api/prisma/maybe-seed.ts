import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const n = await prisma.user.count();
await prisma.$disconnect();

if (n > 0) {
  console.log(`Database already has ${n} users`);
  process.exit(0);
}

await import("./seed.ts");
