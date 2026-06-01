import type { Route } from "./+types/orders.$id.edit";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useState, useEffect } from "react";
import { db } from "~/lib/db.server";
import { weekWhereForAdmin } from "~/lib/admin.shared";
import {
  allocateFinalAmountToPortions,
  calculateDiscount,
  calculatePaymentRatio,
  calculatePortionDiscountShare,
  calculateShippingPerPortion,
  parseOrderItemsFromFormData,
} from "~/lib/order.utils";

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Chỉnh sửa đơn hàng - An Trua Nao" },
    { name: "description", content: "Chỉnh sửa đơn hàng và chia tiền" },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { requireAdminId } = await import("~/lib/session.server");
  const adminId = await requireAdminId(request);

  const orderId = params.id;
  if (!orderId) {
    throw new Response("Order ID is required", { status: 400 });
  }

  // Load order với items và users
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          user: true,
        },
      },
      week: true,
    },
  });

  if (!order) {
    throw new Response("Order not found", { status: 404 });
  }

  if (order.week.adminId !== adminId) {
    throw new Response("Bạn không có quyền chỉnh sửa đơn hàng này", { status: 403 });
  }

  const users = await db.user.findMany({
    orderBy: {
      name: "asc",
    },
  });

  // Gom dòng DB theo (tên món + giá đơn vị), gộp số lượng theo từng userId
  type GroupAcc = {
    itemName: string;
    price: number;
    portions: { userId: string }[];
  };
  const groupedItems = order.items.reduce((acc, item) => {
    const key = `${item.itemName}\0${item.price}`;
    if (!acc[key]) {
      acc[key] = {
        itemName: item.itemName,
        price: item.price,
        portions: [],
      };
    }
    acc[key].portions.push({ userId: item.userId });
    return acc;
  }, {} as Record<string, GroupAcc>);

  const initialItems = Object.values(groupedItems).map((group) => {
    const qtyByUser = new Map<string, number>();
    for (const p of group.portions) {
      qtyByUser.set(p.userId, (qtyByUser.get(p.userId) ?? 0) + 1);
    }
    const lines = Array.from(qtyByUser.entries())
      .sort(([a], [b]) => {
        const na = users.find((u) => u.id === a)?.name ?? "";
        const nb = users.find((u) => u.id === b)?.name ?? "";
        return na.localeCompare(nb, "vi");
      })
      .map(([userId, quantity]) => ({ userId, quantity }));
    return {
      lines: lines.length > 0 ? lines : [{ userId: "", quantity: 1 }],
      itemName: group.itemName,
      price: group.price,
    };
  });

  // Lấy các tuần chưa quyết toán, nhưng luôn bao gồm tuần hiện tại của đơn hàng (nếu có)
  const weeks = await db.week.findMany({
    where: {
      adminId,
      OR: [
        { isFinalized: false },
        { id: order.weekId },
      ],
    },
    orderBy: {
      startDate: "desc",
    },
  });

  return { order, users, weeks, initialItems };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { requireAdminId } = await import("~/lib/session.server");
  const { requireOrderAccess, requireWeekAccess } = await import(
    "~/lib/admin.server"
  );
  const adminId = await requireAdminId(request);

  const orderId = params.id;
  if (!orderId) {
    return Response.json({ error: "Order ID is required" }, { status: 400 });
  }

  await requireOrderAccess(adminId, orderId);

  const formData = await request.formData();
  const description = formData.get("description") as string;
  const weekId = formData.get("weekId") as string;
  const finalAmount = parseFloat(formData.get("finalAmount") as string);
  const shippingFeeRaw = formData.get("shippingFee");
  const shippingFee =
    shippingFeeRaw === null || shippingFeeRaw === ""
      ? 0
      : parseFloat(String(shippingFeeRaw));

  // Validation: Phải chọn tuần
  if (!weekId) {
    return Response.json(
      { error: "Vui lòng chọn tuần cho đơn hàng" },
      { status: 400 }
    );
  }

  await requireWeekAccess(adminId, weekId);

  const parsedItems = parseOrderItemsFromFormData(formData);
  if (!parsedItems.ok) {
    return Response.json({ error: parsedItems.error }, { status: 400 });
  }
  const itemsData = parsedItems.portions;

  // Validation
  if (!description || !description.trim()) {
    return Response.json(
      { error: "Vui lòng nhập mô tả đơn hàng" },
      { status: 400 }
    );
  }

  if (itemsData.length === 0) {
    return Response.json(
      { error: "Vui lòng thêm ít nhất một món ăn và chọn người đặt" },
      { status: 400 }
    );
  }

  // Tính tổng giá các món
  const totalItemsPrice = itemsData.reduce((sum, item) => sum + item.price, 0);

  if (!Number.isFinite(shippingFee) || shippingFee < 0) {
    return Response.json(
      { error: "Tiền ship không hợp lệ (phải là số ≥ 0)" },
      { status: 400 }
    );
  }

  const grossTotal = totalItemsPrice + shippingFee;

  if (grossTotal === 0) {
    return Response.json(
      { error: "Tổng đơn (món + ship) bằng 0 — không thể tính tỷ lệ thanh toán" },
      { status: 400 }
    );
  }

  if (!Number.isFinite(finalAmount)) {
    return Response.json(
      { error: "Tổng tiền phải trả không hợp lệ" },
      { status: 400 }
    );
  }

  if (finalAmount > grossTotal) {
    return Response.json(
      {
        error: `Tổng tiền phải trả (${finalAmount.toLocaleString()} VND) không thể lớn hơn tổng đơn (${grossTotal.toLocaleString()} VND: món + ship)`,
      },
      { status: 400 }
    );
  }

  const discount = calculateDiscount(grossTotal, finalAmount);

  const paymentRatio = calculatePaymentRatio(
    totalItemsPrice,
    shippingFee,
    finalAmount
  );
  const itemPrices = itemsData.map((item) => item.price);
  const finalPrices = allocateFinalAmountToPortions(
    itemPrices,
    shippingFee,
    finalAmount
  );
  const shipPer = calculateShippingPerPortion(shippingFee, itemsData.length);

  try {
    // Update order: xóa items cũ và tạo items mới
    await db.order.update({
      where: { id: orderId },
      data: {
        weekId,
        description: description.trim(),
        totalAmount: grossTotal,
        shippingFee,
        discount,
        finalAmount,
        items: {
          deleteMany: {}, // Xóa tất cả items cũ
          create: itemsData.map((item, idx) => {
            const finalPrice = finalPrices[idx]!;
            const discountShare = calculatePortionDiscountShare(
              item.price,
              shipPer,
              finalPrice,
              paymentRatio
            );
            return {
              userId: item.userId,
              itemName: item.itemName,
              price: item.price,
              discountShare,
              finalPrice,
            };
          }),
        },
      },
    });

    return Response.redirect(new URL("/", request.url).toString(), 302);
  } catch (error) {
    console.error("Error updating order:", error);
    return Response.json(
      { error: "Đã xảy ra lỗi khi cập nhật đơn hàng" },
      { status: 500 }
    );
  }
}

interface DishOrderLine {
  userId: string;
  quantity: number;
}

interface OrderItemRow {
  lines: DishOrderLine[];
  itemName: string;
  price: number;
}

function dishSubtotal(item: OrderItemRow): number {
  const unit = item.price || 0;
  return item.lines.reduce((sum, line) => {
    if (!line.userId) return sum;
    const q =
      Number.isFinite(line.quantity) && line.quantity >= 1
        ? Math.floor(line.quantity)
        : 1;
    return sum + unit * q;
  }, 0);
}

export default function EditOrder() {
  const { order, users, weeks, initialItems } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [items, setItems] = useState<OrderItemRow[]>(initialItems);
  const [finalAmountStr, setFinalAmountStr] = useState(
    String(order.finalAmount)
  );
  const [shippingFeeStr, setShippingFeeStr] = useState(
    order.shippingFee ? String(order.shippingFee) : ""
  );
  const [selectedWeekId, setSelectedWeekId] = useState<string>(order.weekId);
  const [description, setDescription] = useState<string>(order.description || "");

  // Update state khi initialItems thay đổi (sau khi load)
  useEffect(() => {
    setItems(initialItems);
    setFinalAmountStr(String(order.finalAmount));
    setShippingFeeStr(order.shippingFee ? String(order.shippingFee) : "");
    setSelectedWeekId(order.weekId);
    setDescription(order.description || "");
  }, [initialItems, order]);

  const handleAddItem = () => {
    setItems([
      ...items,
      { lines: [{ userId: "", quantity: 1 }], itemName: "", price: 0 },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (
    index: number,
    field: keyof Pick<OrderItemRow, "itemName" | "price">,
    value: string | number
  ) => {
    setItems((prevItems) => {
      const newItems = [...prevItems];
      newItems[index] = { ...newItems[index], [field]: value };
      return newItems;
    });
  };

  const handleAddDishLine = (itemIndex: number) => {
    setItems((prev) => {
      const next = [...prev];
      next[itemIndex] = {
        ...next[itemIndex],
        lines: [...next[itemIndex].lines, { userId: "", quantity: 1 }],
      };
      return next;
    });
  };

  const handleRemoveDishLine = (itemIndex: number, lineIndex: number) => {
    setItems((prev) => {
      const next = [...prev];
      const lines = [...next[itemIndex].lines];
      if (lines.length <= 1) return prev;
      lines.splice(lineIndex, 1);
      next[itemIndex] = { ...next[itemIndex], lines };
      return next;
    });
  };

  const handleDishLineChange = (
    itemIndex: number,
    lineIndex: number,
    patch: Partial<DishOrderLine>
  ) => {
    setItems((prev) => {
      const next = [...prev];
      const lines = [...next[itemIndex].lines];
      lines[lineIndex] = { ...lines[lineIndex], ...patch };
      next[itemIndex] = { ...next[itemIndex], lines };
      return next;
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Chỉnh sửa đơn hàng
      </h1>

      {actionData && typeof actionData === "object" && "error" in actionData && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {String((actionData as { error: string }).error)}
        </div>
      )}

      <Form method="post" className="space-y-6">
        {/* Chọn tuần */}
        <div>
          <label
            htmlFor="weekId"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Tuần <span className="text-red-500">*</span>
          </label>
          <select
            id="weekId"
            name="weekId"
            value={selectedWeekId}
            onChange={(e) => setSelectedWeekId(e.target.value)}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">-- Chọn tuần --</option>
            {weeks.map((week: { id: string; name: string | null; startDate: Date; endDate: Date }) => {
              const startDate = new Date(week.startDate).toLocaleDateString("vi-VN");
              const endDate = new Date(week.endDate).toLocaleDateString("vi-VN");
              return (
                <option key={week.id} value={week.id}>
                  {week.name || `Tuần ${startDate} - ${endDate}`}
                </option>
              );
            })}
          </select>
          {weeks.length === 0 && (
            <p className="mt-1 text-sm text-yellow-600">
              Chưa có tuần nào. Vui lòng{" "}
              <a href="/weeks" className="text-blue-600 hover:underline">
                tạo tuần mới
              </a>{" "}
              trước khi chỉnh sửa đơn hàng.
            </p>
          )}
        </div>

        {/* Mô tả đơn hàng */}
        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Mô tả đơn hàng
          </label>
          <input
            type="text"
            id="description"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Ví dụ: Đặt đồ ăn trưa ngày 15/01"
          />
        </div>

        {/* Hàng 1: tổng món, ship, tổng đơn — Hàng 2: tiền phải trả, giảm/voucher */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tổng giá các món (VND)
              </label>
              <div className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-700">
                {items
                  .reduce((sum, item) => sum + dishSubtotal(item), 0)
                  .toLocaleString("vi-VN")}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Giá đơn vị × tổng số suất (cộng số lượng theo từng người); giá có thể âm (ghi nợ)
              </p>
            </div>
            <div>
              <label
                htmlFor="shippingFee"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Tiền ship (VND)
              </label>
              <input
                type="number"
                id="shippingFee"
                name="shippingFee"
                min={0}
                step="any"
                value={shippingFeeStr}
                onChange={(e) => setShippingFeeStr(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0"
              />
              <p className="text-xs text-gray-500 mt-1">
                Mặc định 0. Mỗi suất: tiền phải trả ÷ (tổng món + ship) × (giá suất + ship ÷ số suất).
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tổng đơn (món + ship)
              </label>
              <div className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-700">
                {(() => {
                  const totalItemsPrice = items.reduce(
                    (sum, item) => sum + dishSubtotal(item),
                    0
                  );
                  const sf = parseFloat(shippingFeeStr);
                  const shippingFee = Number.isFinite(sf) ? Math.max(0, sf) : 0;
                  return (totalItemsPrice + shippingFee).toLocaleString("vi-VN");
                })()}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="finalAmount"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Tổng tiền phải trả (VND) *
              </label>
              <input
                type="number"
                id="finalAmount"
                name="finalAmount"
                value={finalAmountStr}
                onChange={(e) => setFinalAmountStr(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                placeholder="500000 hoặc số âm để ghi nợ"
              />
              <p className="text-xs text-gray-500 mt-1">
                Không lớn hơn (món + ship). Âm có thể dùng ghi nợ.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Giảm / voucher (VND)
              </label>
              <div className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-green-50 text-green-700 font-semibold">
                {(() => {
                  const totalItemsPrice = items.reduce(
                    (sum, item) => sum + dishSubtotal(item),
                    0
                  );
                  const sf = parseFloat(shippingFeeStr);
                  const shippingFee = Number.isFinite(sf) ? Math.max(0, sf) : 0;
                  const grossTotal = totalItemsPrice + shippingFee;
                  const n = parseFloat(finalAmountStr);
                  const finalAmount = Number.isFinite(n) ? n : 0;
                  const discount = calculateDiscount(grossTotal, finalAmount);
                  return discount !== 0 ? discount.toLocaleString("vi-VN") : "0";
                })()}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Tự động: tổng đơn (món + ship) − tổng tiền phải trả.
              </p>
            </div>
          </div>
        </div>

        {/* Danh sách món ăn */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Danh sách món ăn
          </label>
          <div className="space-y-4">
            {items.map((item, index) => (
              <div
                key={index}
                className="border border-gray-200 rounded-md p-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative md:items-start">
                  <div className="md:col-span-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Người đặt và số lượng
                      </label>
                      <button
                        type="button"
                        onClick={() => handleAddDishLine(index)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-lg leading-none"
                        title="Thêm người đặt cho món này"
                      >
                        +
                      </button>
                    </div>
                    <div className="space-y-2">
                      {item.lines.map((line, lineIndex) => (
                        <div
                          key={lineIndex}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <select
                            name={`items[${index}].lines[${lineIndex}].userId`}
                            value={line.userId}
                            onChange={(e) =>
                              handleDishLineChange(index, lineIndex, {
                                userId: e.target.value,
                              })
                            }
                            className="flex-1 min-w-[140px] px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">-- Chọn thành viên --</option>
                            {users.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-1 shrink-0">
                            <label className="sr-only" htmlFor={`qty-${index}-${lineIndex}`}>
                              Số lượng
                            </label>
                            <input
                              id={`qty-${index}-${lineIndex}`}
                              type="number"
                              name={`items[${index}].lines[${lineIndex}].quantity`}
                              min={1}
                              step={1}
                              value={
                                Number.isFinite(line.quantity) && line.quantity >= 1
                                  ? line.quantity
                                  : 1
                              }
                              onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                handleDishLineChange(index, lineIndex, {
                                  quantity:
                                    Number.isFinite(n) && n >= 1 ? n : 1,
                                });
                              }}
                              className="w-20 px-2 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                          {item.lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveDishLine(index, lineIndex)}
                              className="text-sm text-red-600 hover:text-red-800 px-1"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tên món
                    </label>
                    <input
                      type="text"
                      name={`items[${index}].itemName`}
                      value={item.itemName}
                      onChange={(e) =>
                        handleItemChange(index, "itemName", e.target.value)
                      }
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Tên món ăn"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Giá (VND)
                    </label>
                    <input
                      type="number"
                      name={`items[${index}].price`}
                      value={item.price === 0 ? "" : item.price}
                      onChange={(e) => {
                        const t = e.target.value;
                        if (t === "") {
                          handleItemChange(index, "price", 0);
                          return;
                        }
                        const n = parseFloat(t);
                        if (Number.isFinite(n)) {
                          handleItemChange(index, "price", n);
                        }
                      }}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="100000 hoặc -50000 (nợ)"
                    />
                  </div>
                </div>
                {/* Nút xóa ở ngoài grid để không bị tràn */}
                {items.length > 1 && (
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
                    >
                      Xóa món này
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAddItem}
            className="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            + Thêm món
          </button>
        </div>

        {/* Submit button */}
        <div className="flex justify-end space-x-4">
          <a
            href="/"
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Hủy
          </a>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Đang lưu..." : "Cập nhật đơn hàng"}
          </button>
        </div>
      </Form>
    </div>
  );
}

