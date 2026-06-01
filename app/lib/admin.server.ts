import type { Admin } from "@prisma/client";
import { db } from "~/lib/db.server";
import {
  getAdminBankConfig,
  isAdminBankConfigured,
  type AdminBankConfig,
  type PublicAdminSummary,
} from "~/lib/admin.shared";

export type { AdminBankConfig, PublicAdminSummary } from "~/lib/admin.shared";
export {
  getAdminBankConfig,
  isAdminBankConfigured,
  boardUrlForAdmin,
  paymentUrlForAdmin,
  weekWhereForAdmin,
} from "~/lib/admin.shared";

export async function getAdminById(adminId: string): Promise<Admin | null> {
  return db.admin.findUnique({ where: { id: adminId } });
}

export async function listPublicAdmins(): Promise<PublicAdminSummary[]> {
  const admins = await db.admin.findMany({
    orderBy: [{ displayName: "asc" }, { userName: "asc" }],
  });
  return admins.map((a) => ({
    slug: a.slug,
    displayName: a.displayName,
    userName: a.userName,
    bankConfigured: isAdminBankConfigured(a),
  }));
}

export async function getAdminBySlug(slug: string): Promise<Admin | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;
  return db.admin.findUnique({ where: { slug: trimmed } });
}

export async function requireWeekAccess(
  adminId: string,
  weekId: string
): Promise<{ id: string; adminId: string }> {
  const week = await db.week.findUnique({
    where: { id: weekId },
    select: { id: true, adminId: true },
  });
  if (!week) {
    throw new Response("Không tìm thấy tuần", { status: 404 });
  }
  if (week.adminId !== adminId) {
    throw new Response("Bạn không có quyền thao tác tuần này", { status: 403 });
  }
  return week;
}

export async function requireOrderAccess(
  adminId: string,
  orderId: string
): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { week: { select: { adminId: true } } },
  });
  if (!order) {
    throw new Response("Không tìm thấy đơn hàng", { status: 404 });
  }
  if (order.week.adminId !== adminId) {
    throw new Response("Bạn không có quyền thao tác đơn hàng này", {
      status: 403,
    });
  }
}

export type ResolvedBoardAdmin =
  | { ok: true; admin: Admin; bankConfig: AdminBankConfig | null }
  | { ok: false; kind: "missing_slug" | "invalid_slug" };

/**
 * Board context: đăng nhập → admin theo session; khách → bắt buộc ?admin=slug.
 */
export async function resolveBoardAdmin(
  request: Request,
  sessionAdminId: string | null
): Promise<ResolvedBoardAdmin> {
  if (sessionAdminId) {
    const admin = await getAdminById(sessionAdminId);
    if (!admin) {
      return { ok: false, kind: "invalid_slug" };
    }
    return {
      ok: true,
      admin,
      bankConfig: getAdminBankConfig(admin),
    };
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get("admin")?.trim() ?? "";
  if (!slug) {
    return { ok: false, kind: "missing_slug" };
  }

  const admin = await getAdminBySlug(slug);
  if (!admin) {
    return { ok: false, kind: "invalid_slug" };
  }

  return {
    ok: true,
    admin,
    bankConfig: getAdminBankConfig(admin),
  };
}
