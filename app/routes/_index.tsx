import type { Route } from "./+types/_index";
import { Form, useLoaderData, useNavigate } from "react-router";
import { db } from "~/lib/db.server";
import { getAdminId } from "~/lib/session.server";
import { calculateUserTotals, generateQRCodeUrl, formatDate } from "~/lib/order.utils";

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Dashboard - An Trua Nao" },
    { name: "description", content: "Xem tổng quát số tiền từng người phải trả" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Kiểm tra đăng nhập (không bắt buộc cho dashboard)
  const adminId = await getAdminId(request);
  const isAuthenticated = !!adminId;

  const url = new URL(request.url);
  const weekId = url.searchParams.get("weekId");

  // Lấy tất cả tuần
  const allWeeks = await db.week.findMany({
    orderBy: {
      startDate: "desc",
    },
  });

  let weeks: typeof allWeeks;

  if (isAuthenticated) {
    // Nếu đã đăng nhập: hiển thị tất cả các tuần
    weeks = allWeeks;
  } else {
    // Nếu chưa đăng nhập: chỉ hiển thị các tuần có người chưa thanh toán
    const weeksWithUnpaidUsers = await Promise.all(
      allWeeks.map(async (week) => {
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

        // Kiểm tra xem có người nào chưa thanh toán không
        const hasUnpaidUsers = weekUserTotals.some(
          (user) => !paymentMap.get(user.userId)?.paid
        );

        return { week, hasUnpaidUsers };
      })
    );

    // Chỉ giữ lại các tuần có người chưa thanh toán
    weeks = weeksWithUnpaidUsers
      .filter((w) => w.hasUnpaidUsers)
      .map((w) => w.week);
  }

  // Nếu không có tuần nào, trả về empty
  if (weeks.length === 0) {
    return {
      userTotals: [],
      totalOrdersAmount: 0,
      orders: [],
      weeks: [],
      selectedWeek: null,
      isAuthenticated,
    };
  }

  // Chọn tuần: nếu có weekId thì dùng, không thì dùng tuần mới nhất
  const selectedWeek = weekId
    ? weeks.find((w) => w.id === weekId) || weeks[0]
    : weeks[0];

  // Lấy tất cả đơn hàng trong tuần được chọn
  const orders = await db.order.findMany({
    where: {
      weekId: selectedWeek.id,
    },
    include: {
      items: {
        include: {
          user: true,
        },
      },
      week: true,
    },
    orderBy: {
      orderDate: "desc",
    },
  });

  // Tính tổng số tiền từng người
  const allItems = orders.flatMap((order) =>
    order.items.map((item) => ({
      userId: item.userId,
      userName: item.user.name,
      finalPrice: item.finalPrice,
    }))
  );

  const userTotals = calculateUserTotals(allItems);

  // Tính tổng số tiền của tất cả đơn hàng
  const totalOrdersAmount = orders.reduce(
    (sum, order) => sum + order.finalAmount,
    0
  );

  // Lấy trạng thái thanh toán của từng người trong tuần
  const payments = await db.payment.findMany({
    where: {
      weekId: selectedWeek.id,
    },
  });

  // Tạo map để dễ lookup
  const paymentMap = new Map(
    payments.map((p) => [p.userId, { paid: p.paid, paidAt: p.paidAt }])
  );

  // Thêm trạng thái thanh toán vào userTotals
  const userTotalsWithPayment = userTotals.map((user) => ({
    ...user,
    paid: paymentMap.get(user.userId)?.paid || false,
    paidAt: paymentMap.get(user.userId)?.paidAt || null,
  }));

  return {
    userTotals: userTotalsWithPayment,
    totalOrdersAmount,
    orders,
    weeks,
    selectedWeek,
    isAuthenticated,
  };
}

export async function action({ request }: Route.ActionArgs) {
  // Yêu cầu đăng nhập để cập nhật thanh toán
  const adminId = await getAdminId(request);
  if (!adminId) {
    return Response.json(
      { error: "Vui lòng đăng nhập để cập nhật trạng thái thanh toán" },
      { status: 401 }
    );
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "update-payment") {
    const userId = formData.get("userId") as string;
    const weekId = formData.get("weekId") as string;
    const paid = formData.get("paid") === "true";

    if (!userId || !weekId) {
      return Response.json(
        { error: "Thiếu thông tin người dùng hoặc tuần" },
        { status: 400 }
      );
    }

    try {
      // Upsert payment status
      await db.payment.upsert({
        where: {
          userId_weekId: {
            userId,
            weekId,
          },
        },
        update: {
          paid,
          paidAt: paid ? new Date() : null,
        },
        create: {
          userId,
          weekId,
          paid,
          paidAt: paid ? new Date() : null,
        },
      });

      // Redirect để reload data
      const url = new URL(request.url);
      return Response.redirect(url.toString(), 302);
    } catch (error) {
      console.error("Error updating payment status:", error);
      return Response.json(
        { error: "Đã xảy ra lỗi khi cập nhật trạng thái thanh toán" },
        { status: 500 }
      );
    }
  }

  return Response.json({ error: "Invalid intent" }, { status: 400 });
}

export default function Index() {
  const { userTotals, totalOrdersAmount, orders, weeks, selectedWeek, isAuthenticated } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(amount);
  };


  const handleWeekChange = (weekId: string) => {
    const url = new URL(window.location.href);
    if (weekId) {
      url.searchParams.set("weekId", weekId);
    } else {
      url.searchParams.delete("weekId");
    }
    navigate(url.pathname + url.search);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <div className="flex items-center gap-4">
            <a
              href="/payment"
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              Đóng họ
            </a>
            {isAuthenticated && (
              <a
                href="/weeks"
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Quản lý tuần →
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label
            htmlFor="week-select"
            className="text-sm font-medium text-gray-700"
          >
            Chọn tuần:
          </label>
          <select
            id="week-select"
            value={selectedWeek?.id || ""}
            onChange={(e) => handleWeekChange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
          >
            {weeks.map((week) => {
              const startDate = formatDate(week.startDate);
              const endDate = formatDate(week.endDate);
              return (
                <option key={week.id} value={week.id}>
                  {week.name || `Tuần ${startDate} - ${endDate}`}
                </option>
              );
            })}
          </select>
        </div>
        {selectedWeek && (
          <p className="text-gray-600 mt-2">
            Tuần từ {formatDate(selectedWeek.startDate)} đến{" "}
            {formatDate(selectedWeek.endDate)}
          </p>
        )}
      </div>

      {weeks.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-800 mb-4">
            Chưa có tuần nào. Vui lòng tạo tuần mới để bắt đầu.
          </p>
          {isAuthenticated && (
            <a
              href="/weeks"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Quản lý tuần
            </a>
          )}
        </div>
      ) : (
        <>
          {/* Tổng quan */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                Tổng số đơn hàng
              </h3>
              <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                Tổng số tiền
              </h3>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(totalOrdersAmount)}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                Số người tham gia
              </h3>
              <p className="text-2xl font-bold text-gray-900">
                {userTotals.length}
              </p>
            </div>
          </div>

          {/* Bảng số tiền từng người */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                Số tiền từng người phải trả
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tên
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tổng số tiền
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      QR chuyển tiền
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Đã thanh toán
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {userTotals.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-6 py-4 text-center text-gray-500"
                      >
                        Chưa có dữ liệu trong tuần này
                      </td>
                    </tr>
                  ) : (
                    userTotals
                      .sort((a, b) => b.totalAmount - a.totalAmount)
                      .map((user) => (
                        <tr
                          key={user.userId}
                          className={user.paid ? "bg-green-100" : ""}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {user.userName}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="text-sm font-semibold text-gray-900">
                              {formatCurrency(user.totalAmount)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {!user.paid && selectedWeek?.isFinalized ? (
                              <a
                                href={generateQRCodeUrl(user.totalAmount, user.userName, selectedWeek.startDate)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                <svg
                                  className="w-5 h-5 mr-2"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                                  />
                                </svg>
                                QR Code
                              </a>
                            ) : (
                              <span className="text-sm text-gray-400">
                                {selectedWeek?.isFinalized ? "—" : "Chưa quyết toán"}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {isAuthenticated ? (
                              <>
                                <Form method="post" className="inline-block">
                                  <input type="hidden" name="intent" value="update-payment" />
                                  <input type="hidden" name="userId" value={user.userId} />
                                  <input type="hidden" name="weekId" value={selectedWeek?.id || ""} />
                                  <select
                                    name="paid"
                                    value={user.paid ? "true" : "false"}
                                    onChange={(e) => {
                                      const form = e.target.closest("form");
                                      if (form) {
                                        form.requestSubmit();
                                      }
                                    }}
                                    className="px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                                  >
                                    <option value="false">Chưa thanh toán</option>
                                    <option value="true">Đã thanh toán</option>
                                  </select>
                                </Form>
                                {user.paid && user.paidAt && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    {formatDate(new Date(user.paidAt))}
                                  </p>
                                )}
                              </>
                            ) : (
                              <div className="text-sm text-gray-500">
                                {user.paid ? "Đã thanh toán" : "Chưa thanh toán"}
                                {user.paid && user.paidAt && (
                                  <p className="text-xs text-gray-400 mt-1">
                                    {formatDate(new Date(user.paidAt))}
                                  </p>
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

          {/* Danh sách đơn hàng */}
          {orders.length > 0 && (
            <div className="mt-8 bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                  Chi tiết đơn hàng
                </h2>
              </div>
              <div className="divide-y divide-gray-200">
                {orders.map((order) => (
                  <div key={order.id} className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-medium text-gray-900">
                            {order.description || `Đơn hàng ${order.id.slice(0, 8)}`}
                          </h3>
                          {isAuthenticated && !order.week.isFinalized && (
                            <a
                              href={`/orders/${order.id}/edit`}
                              className="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
                            >
                              <svg
                                className="w-4 h-4 mr-1"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                              Chỉnh sửa
                            </a>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {formatDate(new Date(order.orderDate))}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Tổng tiền</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {formatCurrency(order.finalAmount)}
                        </p>
                        {order.discount > 0 && (
                          <p className="text-xs text-green-600">
                            Đã giảm: {formatCurrency(order.discount)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {(() => {
                        // Group items theo itemName
                        const groupedItems = order.items.reduce(
                          (acc, item) => {
                            const key = item.itemName;
                            if (!acc[key]) {
                              acc[key] = {
                                itemName: key,
                                users: [],
                                unitPrice: item.finalPrice, // Giá của 1 món sau khi trừ giảm giá
                              };
                            }
                            acc[key].users.push(item.user.name);
                            return acc;
                          },
                          {} as Record<
                            string,
                            { itemName: string; users: string[]; unitPrice: number }
                          >
                        );

                        return Object.values(groupedItems).map((group, index) => (
                          <div
                            key={`${order.id}-${group.itemName}-${index}`}
                            className="flex justify-between items-center text-sm"
                          >
                            <span className="text-gray-700">
                              {group.itemName} ({group.users.join(", ")})
                            </span>
                            <span className="font-medium text-gray-900">
                              {formatCurrency(group.unitPrice)}
                            </span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

