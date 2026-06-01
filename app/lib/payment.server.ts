import type { Week } from "@prisma/client";
import { db } from "~/lib/db.server";
import {
  getAdminBankConfig,
  type AdminBankConfig,
} from "~/lib/admin.shared";
import {
  applyShippingToUserTotals,
  calculateUserTotals,
} from "~/lib/order.utils";

export type UnpaidWeekRow = {
  week: Week;
  amount: number;
  userName: string;
  userId: string;
  adminSlug: string;
  boardTitle: string;
  bankConfig: AdminBankConfig | null;
};

export async function getUnpaidWeeksForUser(
  adminId: string,
  adminSlug: string,
  boardTitle: string,
  userId: string,
  bankConfig: AdminBankConfig | null,
): Promise<UnpaidWeekRow[]> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return [];

  const allWeeks = await db.week.findMany({
    where: { adminId, isFinalized: true },
    orderBy: { startDate: "desc" },
  });

  const unpaidWeeks: UnpaidWeekRow[] = [];

  for (const week of allWeeks) {
    const weekOrders = await db.order.findMany({
      where: { weekId: week.id },
      include: {
        items: { include: { user: true } },
      },
    });

    const weekItems = weekOrders.flatMap((order) =>
      order.items.map((item) => ({
        userId: item.userId,
        userName: item.user.name,
        finalPrice: item.finalPrice,
      })),
    );

    const weekUserTotalsBase = calculateUserTotals(weekItems);
    const weekUserTotals = applyShippingToUserTotals(
      weekUserTotalsBase,
      weekOrders.map((o) => ({
        shippingFee: o.shippingFee ?? 0,
        items: o.items.map((i) => ({
          userId: i.userId,
          userName: i.user.name,
        })),
      })),
    );

    const userTotal = weekUserTotals.find((u) => u.userId === user.id);
    if (!userTotal) continue;

    const payment = await db.payment.findUnique({
      where: {
        userId_weekId: { userId: user.id, weekId: week.id },
      },
    });

    if (!payment || !payment.paid) {
      unpaidWeeks.push({
        week,
        amount: userTotal.totalAmount,
        userName: user.name,
        userId: user.id,
        adminSlug,
        boardTitle,
        bankConfig,
      });
    }
  }

  return unpaidWeeks;
}

export async function getUnpaidWeeksForUserAcrossAdmins(
  userId: string,
  filterAdminId?: string,
): Promise<UnpaidWeekRow[]> {
  const admins = await db.admin.findMany({
    where: filterAdminId ? { id: filterAdminId } : undefined,
    orderBy: [{ displayName: "asc" }, { userName: "asc" }],
  });

  const rows: UnpaidWeekRow[] = [];
  for (const admin of admins) {
    const boardTitle = admin.displayName || admin.userName;
    const bankConfig = getAdminBankConfig(admin);
    const part = await getUnpaidWeeksForUser(
      admin.id,
      admin.slug,
      boardTitle,
      userId,
      bankConfig,
    );
    rows.push(...part);
  }

  return rows;
}
