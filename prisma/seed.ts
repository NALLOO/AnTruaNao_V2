import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_ADMIN_USER =
  process.env.DEFAULT_ADMIN_USER ?? "admin";
const DEFAULT_ADMIN_PASSWORD =
  process.env.DEFAULT_ADMIN_PASSWORD ?? "admin123";
const DEFAULT_ADMIN_SLUG = process.env.DEFAULT_ADMIN_SLUG ?? "default";
const DEFAULT_BANK_CODE = process.env.DEFAULT_BANK_CODE?.trim() || null;
const DEFAULT_ACCOUNT_NUMBER =
  process.env.DEFAULT_ACCOUNT_NUMBER?.trim() || null;
const DEFAULT_ACCOUNT_HOLDER =
  process.env.DEFAULT_ACCOUNT_HOLDER?.trim() || null;

async function main() {
  const adminCount = await prisma.admin.count();
  if (adminCount > 0) {
    const first = await prisma.admin.findFirst({
      orderBy: { createdAt: "asc" },
    });
    console.log(
      `Đã có ${adminCount} admin (vd. "${first?.userName}" slug=${first?.slug}) — bỏ qua seed gốc. Dùng npm run db:seed:admin để thêm admin mới.`,
    );
    return;
  }

  const admin = await prisma.admin.create({
    data: {
      userName: DEFAULT_ADMIN_USER,
      password: DEFAULT_ADMIN_PASSWORD,
      slug: DEFAULT_ADMIN_SLUG,
      displayName: process.env.DEFAULT_ADMIN_DISPLAY_NAME ?? "An Trua Nao",
      bankCode: DEFAULT_BANK_CODE,
      accountNumber: DEFAULT_ACCOUNT_NUMBER,
      accountHolderName: DEFAULT_ACCOUNT_HOLDER,
    },
  });

  console.log(`Seed OK: đã tạo admin gốc "${admin.userName}" (slug=${admin.slug})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
