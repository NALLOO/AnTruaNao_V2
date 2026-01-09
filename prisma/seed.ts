import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Tạo tài khoản Admin
  const admin = await prisma.admin.upsert({
    where: { userName: "Admin" },
    update: {
      password: "20062001",
    },
    create: {
      userName: "Admin",
      password: "20062001",
    },
  });

  console.log("✅ Admin account created:", admin.userName);
  console.log("📝 Username: Admin");
  console.log("🔑 Password: 20062001");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

