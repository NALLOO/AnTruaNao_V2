import type { Route } from "./+types/weeks";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useState, useEffect, useRef } from "react";
import { db } from "~/lib/db.server";
import { requireAdminId } from "~/lib/session.server";
import { calculateUserTotals } from "~/lib/order.utils";

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Quản lý tuần - An Trua Nao" },
    { name: "description", content: "Quản lý các tuần đặt đồ ăn" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Yêu cầu đăng nhập
  await requireAdminId(request);

  const weeks = await db.week.findMany({
    include: {
      _count: {
        select: {
          orders: true,
        },
      },
    },
    orderBy: {
      startDate: "desc",
    },
  });

  // Tính trạng thái thanh toán cho mỗi tuần
  const weeksWithPaymentStatus = await Promise.all(
    weeks.map(async (week) => {
      // Lấy đơn hàng trong tuần
      const weekOrders = await db.order.findMany({
        where: { weekId: week.id },
        include: {
          items: {
            include: { user: true },
          },
        },
      });

      // Tính userTotals cho tuần này
      const weekItems = weekOrders.flatMap((order) =>
        order.items.map((item) => ({
          userId: item.userId,
          userName: item.user.name,
          finalPrice: item.finalPrice,
        }))
      );

      const weekUserTotals = calculateUserTotals(weekItems);

      // Lấy trạng thái thanh toán
      const weekPayments = await db.payment.findMany({
        where: { weekId: week.id },
      });

      const paymentMap = new Map(
        weekPayments.map((p) => [p.userId, { paid: p.paid, paidAt: p.paidAt }])
      );

      // Kiểm tra xem tất cả người đã thanh toán chưa
      const allPaid = weekUserTotals.length > 0 && weekUserTotals.every(
        (user) => paymentMap.get(user.userId)?.paid === true
      );

      return {
        ...week,
        allPaid,
        hasUsers: weekUserTotals.length > 0,
      };
    })
  );

  return { weeks: weeksWithPaymentStatus };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    const startDateStr = formData.get("startDate") as string;
    const name = formData.get("name") as string | null;

    if (!startDateStr) {
      return Response.json(
        { error: "Vui lòng chọn ngày bắt đầu tuần" },
        { status: 400 }
      );
    }

    const startDate = new Date(startDateStr);
    startDate.setHours(0, 0, 0, 0);

    // Kiểm tra xem ngày có phải là Thứ hai không
    // getDay() trả về: 0=Chủ nhật, 1=Thứ hai, ..., 6=Thứ bảy
    const dayOfWeek = startDate.getDay();
    if (dayOfWeek !== 1) {
      const dayNames = [
        "Chủ nhật",
        "Thứ hai",
        "Thứ ba",
        "Thứ tư",
        "Thứ năm",
        "Thứ sáu",
        "Thứ bảy",
      ];
      return Response.json(
        {
          error: `Ngày bắt đầu tuần phải là Thứ hai. Ngày bạn chọn là ${dayNames[dayOfWeek]}.`,
        },
        { status: 400 }
      );
    }

    // Tính ngày kết thúc tuần (Thứ sáu)
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 4);
    endDate.setHours(23, 59, 59, 999);

    // Kiểm tra xem tuần này đã tồn tại chưa
    const existingWeek = await db.week.findFirst({
      where: {
        OR: [
          {
            startDate: {
              lte: endDate,
            },
            endDate: {
              gte: startDate,
            },
          },
        ],
      },
    });

    if (existingWeek) {
      return Response.json(
        {
          error: `Tuần này đã tồn tại (${existingWeek.startDate.toLocaleDateString("vi-VN")} - ${existingWeek.endDate.toLocaleDateString("vi-VN")})`,
        },
        { status: 400 }
      );
    }

    try {
      await db.week.create({
        data: {
          startDate,
          endDate,
          name: name?.trim() || null,
        },
      });

      return Response.redirect(new URL("/weeks", request.url).toString(), 302);
    } catch (error) {
      console.error("Error creating week:", error);
      return Response.json(
        { error: "Đã xảy ra lỗi khi tạo tuần" },
        { status: 500 }
      );
    }
  }

  if (intent === "finalize") {
    const weekId = formData.get("weekId") as string;

    if (!weekId) {
      return Response.json(
        { error: "Không tìm thấy tuần cần quyết toán" },
        { status: 400 }
      );
    }

    // Kiểm tra xem tuần có tồn tại không
    const week = await db.week.findUnique({
      where: { id: weekId },
    });

    if (!week) {
      return Response.json(
        { error: "Không tìm thấy tuần" },
        { status: 404 }
      );
    }

    try {
      await db.week.update({
        where: { id: weekId },
        data: {
          isFinalized: true,
          finalizedAt: new Date(),
        },
      });

      return Response.redirect(new URL("/weeks", request.url).toString(), 302);
    } catch (error) {
      console.error("Error finalizing week:", error);
      return Response.json(
        { error: "Đã xảy ra lỗi khi quyết toán tuần" },
        { status: 500 }
      );
    }
  }

  if (intent === "delete") {
    const weekId = formData.get("weekId") as string;

    if (!weekId) {
      return Response.json(
        { error: "Không tìm thấy tuần cần xóa" },
        { status: 400 }
      );
    }

    // Kiểm tra xem tuần có đơn hàng không
    const week = await db.week.findUnique({
      where: { id: weekId },
      include: {
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    if (!week) {
      return Response.json(
        { error: "Không tìm thấy tuần" },
        { status: 404 }
      );
    }

    if (week._count.orders > 0) {
      return Response.json(
        {
          error: `Không thể xóa tuần này vì có ${week._count.orders} đơn hàng. Vui lòng xóa các đơn hàng trước.`,
        },
        { status: 400 }
      );
    }

    try {
      await db.week.delete({
        where: { id: weekId },
      });

      return Response.redirect(new URL("/weeks", request.url).toString(), 302);
    } catch (error) {
      console.error("Error deleting week:", error);
      return Response.json(
        { error: "Đã xảy ra lỗi khi xóa tuần" },
        { status: 500 }
      );
    }
  }

  return Response.json({ error: "Invalid intent" }, { status: 400 });
}

export default function Weeks() {
  const { weeks } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [showAddForm, setShowAddForm] = useState(false);
  const [startDate, setStartDate] = useState<string | undefined>(undefined);
  const [dateError, setDateError] = useState<string | null>(null);

  // Reset form sau khi submit thành công
  const wasSubmittingRef = useRef(false);

  useEffect(() => {
    if (wasSubmittingRef.current && navigation.state === "idle") {
      setShowAddForm(false);
      setStartDate(undefined);
      setDateError(null);
      wasSubmittingRef.current = false;
    }
    if (navigation.state === "submitting") {
      wasSubmittingRef.current = true;
    }
  }, [navigation.state]);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // Tính ngày bắt đầu tuần hiện tại (Thứ hai)
  const getCurrentWeekStart = () => {
    const now = new Date();
    const startOfWeek = new Date(now);
    // Tính về Thứ hai gần nhất
    // getDay() trả về: 0=Chủ nhật, 1=Thứ hai, ..., 6=Thứ bảy
    // Nếu là Chủ nhật (0), quay về Thứ hai tuần trước (-6)
    // Nếu là Thứ hai (1), giữ nguyên (0)
    // Nếu là Thứ ba trở đi (2-6), quay về Thứ hai (-(day-1))
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startOfWeek.setDate(now.getDate() - daysToMonday);
    startOfWeek.setHours(0, 0, 0, 0);
    return startOfWeek.toISOString().split("T")[0];
  };

  // Kiểm tra ngày có phải là Thứ hai không
  const validateDate = (dateStr: string) => {
    if (!dateStr) {
      setDateError(null);
      return;
    }

    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();
    const dayNames = [
      "Chủ nhật",
      "Thứ hai",
      "Thứ ba",
      "Thứ tư",
      "Thứ năm",
      "Thứ sáu",
      "Thứ bảy",
    ];

    if (dayOfWeek !== 1) {
      setDateError(
        `Ngày bắt đầu tuần phải là Thứ hai. Ngày bạn chọn là ${dayNames[dayOfWeek]}.`
      );
    } else {
      setDateError(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Quản lý tuần</h1>
        <button
          type="button"
          onClick={() => {
            setShowAddForm(!showAddForm);
            if (!showAddForm) {
              // Set default là Thứ 2 tuần hiện tại
              const defaultDate = getCurrentWeekStart();
              setStartDate(defaultDate);
              setDateError(null);
            } else {
              setStartDate(undefined);
              setDateError(null);
            }
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {showAddForm ? "Hủy" : "Thêm tuần mới"}
        </button>
      </div>

      {actionData &&
        typeof actionData === "object" &&
        "error" in actionData && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {String((actionData as { error: string }).error)}
          </div>
        )}

      {/* Form thêm tuần mới */}
      {showAddForm && (
        <div className="mb-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Thêm tuần mới
          </h2>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="create" />

            <div>
              <label
                htmlFor="startDate"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Ngày bắt đầu tuần (Thứ hai) <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                id="startDate"
                name="startDate"
                value={startDate || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  setStartDate(value);
                  validateDate(value);
                }}
                required
                autoComplete="off"
                className={`w-full px-4 py-2 border rounded-md shadow-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500 cursor-pointer ${dateError ? "border-red-500" : "border-gray-300"
                  }`}
                style={{ cursor: "pointer" }}
              />
              {dateError && (
                <p className="mt-1 text-sm text-red-600">{dateError}</p>
              )}
              {!dateError && (
                <p className="mt-1 text-sm text-gray-500">
                  Tuần sẽ kéo dài từ Thứ hai đến Thứ sáu (5 ngày)
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Tên tuần (tùy chọn)
              </label>
              <input
                type="text"
                id="name"
                name="name"
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ví dụ: Tuần 1 - Tháng 1/2024"
              />
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={isSubmitting || !!dateError}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Đang lưu..." : "Lưu"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setStartDate(undefined);
                  setDateError(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                Hủy
              </button>
            </div>
          </Form>
        </div>
      )}

      {/* Danh sách tuần */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Danh sách tuần</h2>
        </div>
        {weeks.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            Chưa có tuần nào. Hãy thêm tuần mới để bắt đầu.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tên tuần
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thời gian
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Số đơn hàng
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trạng thái thanh toán
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trạng thái quyết toán
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {weeks.map((week) => (
                  <tr key={week.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {week.name || "Không có tên"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatDate(week.startDate)} - {formatDate(week.endDate)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {week._count.orders} đơn
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {week.hasUsers ? (
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${week.allPaid
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                            }`}
                        >
                          {week.allPaid ? "Đã thanh toán đủ" : "Chưa thanh toán đủ"}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">Chưa có dữ liệu</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {week.isFinalized ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Đã quyết toán
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Chưa quyết toán
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-3">
                        <a
                          href={`/?weekId=${week.id}`}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Xem chi tiết
                        </a>
                        {!week.isFinalized && (
                          <Form method="post" className="inline">
                            <input type="hidden" name="intent" value="finalize" />
                            <input type="hidden" name="weekId" value={week.id} />
                            <button
                              type="submit"
                              disabled={isSubmitting}
                              className="text-green-600 hover:text-green-900 disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={(e) => {
                                if (
                                  !confirm(
                                    "Bạn có chắc chắn muốn quyết toán tuần này? Sau khi quyết toán, QR thanh toán sẽ được hiển thị trên dashboard."
                                  )
                                ) {
                                  e.preventDefault();
                                }
                              }}
                            >
                              Quyết toán tuần
                            </button>
                          </Form>
                        )}
                        <Form method="post" className="inline">
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="weekId" value={week.id} />
                          <button
                            type="submit"
                            disabled={isSubmitting || week._count.orders > 0}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={(e) => {
                              if (
                                !confirm(
                                  `Bạn có chắc chắn muốn xóa tuần này?${week._count.orders > 0 ? ` Tuần này có ${week._count.orders} đơn hàng.` : ""}`
                                )
                              ) {
                                e.preventDefault();
                              }
                            }}
                          >
                            Xóa
                          </button>
                        </Form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

