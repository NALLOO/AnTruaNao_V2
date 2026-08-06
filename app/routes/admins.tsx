import type { Route } from "./+types/admins";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useEffect, useRef, useState } from "react";
import { db } from "~/lib/db.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Quản lý Admin - An Trua Nao" },
    { name: "description", content: "Thêm hoặc xóa tài khoản admin" },
  ];
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export async function loader({ request }: Route.LoaderArgs) {
  const { requireAdminId } = await import("~/lib/session.server");
  const { requireSuperAdmin } = await import("~/lib/admin.server");
  const adminId = await requireAdminId(request);
  await requireSuperAdmin(adminId);

  const admins = await db.admin.findMany({
    orderBy: [{ createdAt: "asc" }],
    include: { _count: { select: { weeks: true } } },
  });

  return { admins, currentAdminId: adminId };
}

export async function action({ request }: Route.ActionArgs) {
  const { requireAdminId } = await import("~/lib/session.server");
  const { requireSuperAdmin } = await import("~/lib/admin.server");
  const adminId = await requireAdminId(request);
  await requireSuperAdmin(adminId);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    const userName = (formData.get("userName") as string)?.trim() || "";
    const password = (formData.get("password") as string) || "";
    const slug = (formData.get("slug") as string)?.trim() || "";
    const displayName = (formData.get("displayName") as string)?.trim() || null;
    const isSuperAdmin = formData.get("isSuperAdmin") === "on";

    if (!userName || !password || !slug) {
      return Response.json(
        { error: "Vui lòng nhập đủ tài khoản, mật khẩu và slug" },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return Response.json(
        { error: "Mật khẩu phải có ít nhất 6 ký tự" },
        { status: 400 }
      );
    }
    if (!SLUG_PATTERN.test(slug)) {
      return Response.json(
        {
          error:
            "Slug chỉ gồm chữ thường, số và dấu gạch ngang (vd. nghiapd, team-a)",
        },
        { status: 400 }
      );
    }

    const existingUserName = await db.admin.findUnique({ where: { userName } });
    if (existingUserName) {
      return Response.json(
        { error: `Tài khoản "${userName}" đã tồn tại` },
        { status: 400 }
      );
    }

    const existingSlug = await db.admin.findUnique({ where: { slug } });
    if (existingSlug) {
      return Response.json(
        { error: `Slug "${slug}" đã được dùng` },
        { status: 400 }
      );
    }

    await db.admin.create({
      data: {
        userName,
        password,
        slug,
        displayName: displayName || userName,
        isSuperAdmin,
      },
    });

    return Response.redirect(new URL("/admins", request.url).toString(), 302);
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;

    if (!id) {
      return Response.json({ error: "ID không hợp lệ" }, { status: 400 });
    }

    if (id === adminId) {
      return Response.json(
        { error: "Không thể tự xóa tài khoản đang đăng nhập" },
        { status: 400 }
      );
    }

    const target = await db.admin.findUnique({
      where: { id },
      include: { _count: { select: { weeks: true } } },
    });

    if (!target) {
      return Response.json({ error: "Admin không tồn tại" }, { status: 404 });
    }

    if (target._count.weeks > 0) {
      return Response.json(
        { error: "Không thể xóa admin đã có tuần/đơn hàng" },
        { status: 400 }
      );
    }

    if (target.isSuperAdmin) {
      const superAdminCount = await db.admin.count({
        where: { isSuperAdmin: true },
      });
      if (superAdminCount <= 1) {
        return Response.json(
          { error: "Không thể xóa super admin cuối cùng" },
          { status: 400 }
        );
      }
    }

    await db.admin.delete({ where: { id } });

    return Response.redirect(new URL("/admins", request.url).toString(), 302);
  }

  return Response.json({ error: "Invalid intent" }, { status: 400 });
}

export default function Admins() {
  const { admins, currentAdminId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [showAddForm, setShowAddForm] = useState(false);
  const wasSubmitting = useRef(false);

  useEffect(() => {
    if (navigation.state === "submitting") {
      wasSubmitting.current = true;
    }
    if (wasSubmitting.current && navigation.state === "idle") {
      setShowAddForm(false);
      wasSubmitting.current = false;
    }
  }, [navigation.state]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Quản lý Admin</h1>
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
        >
          {showAddForm ? "Hủy" : "+ Thêm admin"}
        </button>
      </div>

      {actionData &&
        typeof actionData === "object" &&
        "error" in actionData && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {String((actionData as { error: string }).error)}
          </div>
        )}

      {showAddForm && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Thêm admin mới
          </h2>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="create" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tài khoản *
                </label>
                <input
                  type="text"
                  name="userName"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900"
                  placeholder="admin2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mật khẩu *
                </label>
                <input
                  type="password"
                  name="password"
                  required
                  minLength={6}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Slug board *
                </label>
                <input
                  type="text"
                  name="slug"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900"
                  placeholder="team-b"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tên hiển thị
                </label>
                <input
                  type="text"
                  name="displayName"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900"
                  placeholder="Nhóm B"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="isSuperAdmin" />
              Cấp quyền super admin
            </label>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? "Đang lưu..." : "Thêm admin"}
              </button>
            </div>
          </Form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            Danh sách admin ({admins.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tài khoản
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Slug
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vai trò
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {admins.map((admin) => (
                <tr key={admin.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {admin.userName}
                    {admin.id === currentAdminId && (
                      <span className="ml-2 text-xs text-gray-400">(bạn)</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {admin.slug}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {admin.isSuperAdmin ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        Super admin
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        Admin
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {admin.id !== currentAdminId && admin._count.weeks === 0 && (
                      <Form method="post" className="inline">
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={admin.id} />
                        <button
                          type="submit"
                          className="text-red-600 hover:text-red-900 cursor-pointer"
                          onClick={(e) => {
                            if (
                              !confirm(
                                `Bạn có chắc muốn xóa admin "${admin.userName}"?`
                              )
                            ) {
                              e.preventDefault();
                            }
                          }}
                        >
                          Xóa
                        </button>
                      </Form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
