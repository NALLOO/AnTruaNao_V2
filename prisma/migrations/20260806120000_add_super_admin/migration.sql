-- Super admin: quyền thêm/xóa admin khác, xóa thành viên
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;
