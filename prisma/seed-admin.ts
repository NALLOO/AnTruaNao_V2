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
  const userName = requireEnv("SEED_ADMIN_USER");
  const password = requireEnv("SEED_ADMIN_PASSWORD");
  const slug = requireEnv("SEED_ADMIN_SLUG");

  const displayName = process.env.SEED_ADMIN_DISPLAY_NAME?.trim() ?? userName;
  const bankCode = process.env.SEED_ADMIN_BANK_CODE?.trim() || null;
  const accountNumber = process.env.SEED_ADMIN_ACCOUNT_NUMBER?.trim() || null;
  const accountHolderName =
    process.env.SEED_ADMIN_ACCOUNT_HOLDER?.trim() || null;

  const existingByUser = await prisma.admin.findUnique({ where: { userName } });
  if (existingByUser) {
    console.error(
      `Admin "${userName}" đã tồn tại (slug=${existingByUser.slug}). Không cập nhật — dừng.`,
    );
    process.exit(1);
  }

  const existingBySlug = await prisma.admin.findUnique({ where: { slug } });
  if (existingBySlug) {
    console.error(
      `Slug "${slug}" đã được dùng bởi "${existingBySlug.userName}". Chọn slug khác.`,
    );
    process.exit(1);
  }

  const admin = await prisma.admin.create({
    data: {
      userName,
      password,
      slug,
      displayName,
      bankCode,
      accountNumber,
      accountHolderName,
    },
  });

  console.log(
    `Đã tạo admin mới: user="${admin.userName}" slug=${admin.slug} id=${admin.id}`,
  );
  console.log(`Board: /?admin=${admin.slug}`);
  console.log(`Đóng họ: /payment?admin=${admin.slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
