import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Xóa admin slug "default" không có tuần — thường là bản seed trùng sau khi
 * admin thật đổi slug (vd. default → admin).
 */
async function main() {
  const keeper = await prisma.admin.findFirst({
    where: { weeks: { some: {} } },
    orderBy: { createdAt: "asc" },
  });

  if (!keeper) {
    console.log("Không có admin nào có tuần — không xóa gì.");
    return;
  }

  const result = await prisma.admin.deleteMany({
    where: {
      slug: "default",
      weeks: { none: {} },
      id: { not: keeper.id },
    },
  });

  if (result.count === 0) {
    console.log("Không có admin slug=default trống để xóa.");
    return;
  }

  console.log(
    `Đã xóa ${result.count} admin trùng (slug=default, không có tuần). Admin giữ dữ liệu: "${keeper.userName}" slug=${keeper.slug}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
