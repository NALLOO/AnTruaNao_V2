import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Thiếu biến môi trường bắt buộc: ${name}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const userName = requireEnv("SUPER_ADMIN_USER");

  const admin = await prisma.admin.findUnique({ where: { userName } });
  if (!admin) {
    console.error(`Không tìm thấy admin với userName="${userName}"`);
    process.exit(1);
  }

  if (admin.isSuperAdmin) {
    console.log(`Admin "${userName}" đã là super admin — không cần thay đổi.`);
    return;
  }

  await prisma.admin.update({
    where: { userName },
    data: { isSuperAdmin: true },
  });

  console.log(`Đã cấp quyền super admin cho "${userName}" (slug=${admin.slug}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
