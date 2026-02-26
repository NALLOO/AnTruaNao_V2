import type { Route } from "./+types/members";
import { Form, useLoaderData, useNavigation } from "react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import { db } from "~/lib/db.server";
import { requireAdminId } from "~/lib/session.server";

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Quản lý thành viên - An Trua Nao" },
    { name: "description", content: "Quản lý danh sách thành viên đặt đồ" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Yêu cầu đăng nhập
  await requireAdminId(request);

  const users = await db.user.findMany({
    include: {
      _count: {
        select: {
          orderItems: true,
        },
      },
      orderItems: {
        select: { finalPrice: true },
      },
    },
  });

  // Tính tổng số tiền mỗi thành viên (tổng finalPrice các orderItem)
  const usersWithTotal = users.map(({ orderItems, ...user }) => ({
    ...user,
    totalAmount: orderItems.reduce((sum, item) => sum + item.finalPrice, 0),
  }));

  // Sắp xếp theo số đơn hàng giảm dần
  usersWithTotal.sort((a, b) => b._count.orderItems - a._count.orderItems);

  return { users: usersWithTotal };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    // Lấy danh sách thành viên từ form (hỗ trợ thêm nhiều người cùng lúc)
    const members: Array<{ name: string; email: string | null }> = [];
    let index = 0;

    while (formData.get(`members[${index}].name`)) {
      const name = formData.get(`members[${index}].name`) as string;
      const email = formData.get(`members[${index}].email`) as string;

      if (name && name.trim()) {
        members.push({
          name: name.trim(),
          email: email?.trim() || null,
        });
      }
      index++;
    }

    if (members.length === 0) {
      return Response.json(
        { error: "Vui lòng nhập ít nhất một thành viên" },
        { status: 400 }
      );
    }

    // Kiểm tra tên đã tồn tại chưa
    const names = members.map((m) => m.name);
    const existing = await db.user.findMany({
      where: {
        name: {
          in: names,
        },
      },
    });

    if (existing.length > 0) {
      const existingNames = existing.map((u) => u.name).join(", ");
      return Response.json(
        { error: `Tên thành viên đã tồn tại: ${existingNames}` },
        { status: 400 }
      );
    }

    // Tạo nhiều thành viên cùng lúc
    await db.user.createMany({
      data: members,
    });

    return Response.redirect(new URL("/members", request.url).toString(), 302);
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;

    if (!id) {
      return Response.json({ error: "ID không hợp lệ" }, { status: 400 });
    }

    // Kiểm tra xem user có đơn hàng không
    const user = await db.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            orderItems: true,
          },
        },
      },
    });

    if (!user) {
      return Response.json({ error: "Thành viên không tồn tại" }, { status: 404 });
    }

    if (user._count.orderItems > 0) {
      return Response.json(
        { error: "Không thể xóa thành viên đã có đơn hàng" },
        { status: 400 }
      );
    }

    await db.user.delete({
      where: { id },
    });

    return Response.redirect(new URL("/members", request.url).toString(), 302);
  }

  if (intent === "update") {
    const id = formData.get("id") as string;
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;

    if (!id || !name || !name.trim()) {
      return Response.json(
        { error: "ID và tên không được để trống" },
        { status: 400 }
      );
    }

    // Kiểm tra tên đã tồn tại chưa (trừ chính nó)
    const existing = await db.user.findFirst({
      where: {
        name: name.trim(),
        NOT: { id },
      },
    });

    if (existing) {
      return Response.json(
        { error: "Tên thành viên đã tồn tại" },
        { status: 400 }
      );
    }

    await db.user.update({
      where: { id },
      data: {
        name: name.trim(),
        email: email?.trim() || null,
      },
    });

    return Response.redirect(new URL("/members", request.url).toString(), 302);
  }

  return Response.json({ error: "Invalid intent" }, { status: 400 });
}

export default function Members() {
  const { users } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editName, setEditName] = useState<string>("");
  const [editEmail, setEditEmail] = useState<string>("");
  const [newMembers, setNewMembers] = useState<Array<{ name: string; email: string }>>([
    { name: "", email: "" },
  ]);

  // Sắp xếp: theo số đơn hàng hoặc tổng tiền, asc/desc
  type SortColumn = "orderCount" | "totalAmount";
  const [sortBy, setSortBy] = useState<SortColumn>("orderCount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortedUsers = useMemo(() => {
    const list = [...users];
    list.sort((a, b) => {
      if (sortBy === "orderCount") {
        const d = a._count.orderItems - b._count.orderItems;
        return sortDir === "asc" ? d : -d;
      }
      const d = a.totalAmount - b.totalAmount;
      return sortDir === "asc" ? d : -d;
    });
    return list;
  }, [users, sortBy, sortDir]);

  const toggleSort = (column: SortColumn) => {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("desc");
    }
  };

  // Track khi đang submit để reset sau khi hoàn thành
  const wasSubmitting = useRef(false);
  const prevUsersLength = useRef(users.length);

  // Reset edit state khi navigation hoàn thành (sau khi submit thành công)
  useEffect(() => {
    // Đánh dấu khi bắt đầu submitting
    if (navigation.state === "submitting") {
      wasSubmitting.current = true;
    }

    // Reset ngay khi chuyển về "idle" sau khi đã submit
    if (wasSubmitting.current && navigation.state === "idle") {
      // Reset edit state sau khi submit thành công
      setEditingId(null);
      setEditName("");
      setEditEmail("");
      setShowAddForm(false);
      setNewMembers([{ name: "", email: "" }]);
      wasSubmitting.current = false;
    }
  }, [navigation.state]);

  // Reset edit state khi users data thay đổi (sau redirect reload)
  useEffect(() => {
    if (prevUsersLength.current !== users.length && editingId) {
      // Data đã thay đổi sau redirect, reset edit mode
      setEditingId(null);
      setEditName("");
      setEditEmail("");
    }
    prevUsersLength.current = users.length;
  }, [users.length, editingId]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Quản lý thành viên
        </h1>
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
        >
          {showAddForm ? "Hủy" : "+ Thêm thành viên"}
        </button>
      </div>

      {/* Form thêm thành viên */}
      {showAddForm && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Thêm thành viên mới
          </h2>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="create" />
            <div className="space-y-4">
              {newMembers.map((member, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-end"
                >
                  <div>
                    <label
                      htmlFor={`new-name-${index}`}
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Tên thành viên *
                    </label>
                    <input
                      type="text"
                      id={`new-name-${index}`}
                      name={`members[${index}].name`}
                      value={member.name}
                      onChange={(e) => {
                        const updated = [...newMembers];
                        updated[index].name = e.target.value;
                        setNewMembers(updated);
                      }}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Nhập tên thành viên"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`new-email-${index}`}
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Email (tùy chọn)
                    </label>
                    <input
                      type="email"
                      id={`new-email-${index}`}
                      name={`members[${index}].email`}
                      value={member.email}
                      onChange={(e) => {
                        const updated = [...newMembers];
                        updated[index].email = e.target.value;
                        setNewMembers(updated);
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="email@example.com"
                    />
                  </div>
                  {newMembers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewMembers(newMembers.filter((_, i) => i !== index));
                      }}
                      className="text-gray-400 hover:text-red-600 text-xl leading-none pb-3 cursor-pointer"
                      title="Xóa dòng này"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  setNewMembers([...newMembers, { name: "", email: "" }]);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
              >
                <span className="text-lg">+</span>
                Thêm dòng
              </button>
              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewMembers([{ name: "", email: "" }]);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSubmitting ? "Đang lưu..." : "Thêm thành viên"}
                </button>
              </div>
            </div>
          </Form>
        </div>
      )}

      {/* Danh sách thành viên */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            Danh sách thành viên ({users.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tên
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    Số đơn hàng
                    <button
                      type="button"
                      onClick={() => toggleSort("orderCount")}
                      className="p-0.5 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-900 cursor-pointer"
                      title={sortBy === "orderCount" ? (sortDir === "desc" ? "Giảm dần (click để tăng dần)" : "Tăng dần (click để giảm dần)") : "Sắp xếp theo số đơn hàng"}
                    >
                      {sortBy === "orderCount" ? (sortDir === "desc" ? " ↓" : " ↑") : " ⇅"}
                    </button>
                  </span>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    Tổng số tiền
                    <button
                      type="button"
                      onClick={() => toggleSort("totalAmount")}
                      className="p-0.5 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-900 cursor-pointer"
                      title={sortBy === "totalAmount" ? (sortDir === "desc" ? "Giảm dần (click để tăng dần)" : "Tăng dần (click để giảm dần)") : "Sắp xếp theo tổng tiền"}
                    >
                      {sortBy === "totalAmount" ? (sortDir === "desc" ? " ↓" : " ↑") : " ⇅"}
                    </button>
                  </span>
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    Chưa có thành viên nào
                  </td>
                </tr>
              ) : (
                sortedUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingId === user.id ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          required
                          className="px-2 py-1 border border-gray-300 rounded text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                        />
                      ) : (
                        <div className="text-sm font-medium text-gray-900">
                          {user.name}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingId === user.id ? (
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                        />
                      ) : (
                        <div className="text-sm text-gray-500">
                          {user.email || "-"}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {user._count.orderItems}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {user.totalAmount.toLocaleString("vi-VN")} ₫
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {editingId === user.id ? (
                        <div className="flex justify-end space-x-2">
                          <Form method="post" className="inline">
                            <input type="hidden" name="intent" value="update" />
                            <input type="hidden" name="id" value={user.id} />
                            <input type="hidden" name="name" value={editName} />
                            <input type="hidden" name="email" value={editEmail} />
                            <button
                              type="submit"
                              className="text-blue-600 hover:text-blue-900 cursor-pointer"
                            >
                              Lưu
                            </button>
                          </Form>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditName("");
                              setEditEmail("");
                            }}
                            className="text-gray-600 hover:text-gray-900 cursor-pointer"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(user.id);
                              setEditName(user.name);
                              setEditEmail(user.email || "");
                            }}
                            className="text-blue-600 hover:text-blue-900 cursor-pointer"
                          >
                            Sửa
                          </button>
                          {user._count.orderItems === 0 && (
                            <Form method="post" className="inline">
                              <input type="hidden" name="intent" value="delete" />
                              <input type="hidden" name="id" value={user.id} />
                              <button
                                type="submit"
                                className="text-red-600 hover:text-red-900 cursor-pointer"
                                onClick={(e) => {
                                  if (
                                    !confirm(
                                      `Bạn có chắc muốn xóa thành viên "${user.name}"?`
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
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

