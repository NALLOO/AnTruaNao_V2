import type { Route } from "./+types/orders.$id.edit";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useState, useEffect, useRef } from "react";
import { db } from "~/lib/db.server";
import { requireAdminId } from "~/lib/session.server";
import {
  calculateDiscount,
  calculateDiscountPerItem,
  calculateFinalPrice,
} from "~/lib/order.utils";

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Chỉnh sửa đơn hàng - An Trua Nao" },
    { name: "description", content: "Chỉnh sửa đơn hàng và chia tiền" },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  // Yêu cầu đăng nhập
  await requireAdminId(request);

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

  const users = await db.user.findMany({
    orderBy: {
      name: "asc",
    },
  });

  // Lấy các tuần chưa quyết toán, nhưng luôn bao gồm tuần hiện tại của đơn hàng (nếu có)
  const weeks = await db.week.findMany({
    where: {
      OR: [
        { isFinalized: false }, // Tuần chưa quyết toán
        { id: order.weekId }, // Luôn bao gồm tuần hiện tại của đơn hàng
      ],
    },
    orderBy: {
      startDate: "desc",
    },
  });

  // Transform order.items thành format OrderItem[] (group theo itemName)
  const groupedItems = order.items.reduce(
    (acc, item) => {
      const key = item.itemName;
      if (!acc[key]) {
        acc[key] = {
          itemName: key,
          price: item.price,
          userIds: [],
          userNames: [],
        };
      }
      acc[key].userIds.push(item.userId);
      acc[key].userNames.push(item.user.name);
      return acc;
    },
    {} as Record<
      string,
      { itemName: string; price: number; userIds: string[]; userNames: string[] }
    >
  );

  const initialItems = Object.values(groupedItems);

  return { order, users, weeks, initialItems };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdminId(request);

  const orderId = params.id;
  if (!orderId) {
    return Response.json({ error: "Order ID is required" }, { status: 400 });
  }

  // Kiểm tra order có tồn tại không
  const existingOrder = await db.order.findUnique({
    where: { id: orderId },
  });

  if (!existingOrder) {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const description = formData.get("description") as string;
  const weekId = formData.get("weekId") as string;
  const finalAmount = parseFloat(formData.get("finalAmount") as string);

  // Validation: Phải chọn tuần
  if (!weekId) {
    return Response.json(
      { error: "Vui lòng chọn tuần cho đơn hàng" },
      { status: 400 }
    );
  }

  // Lấy danh sách items từ form
  const itemsData: Array<{
    userId: string;
    userName: string;
    itemName: string;
    price: number;
  }> = [];

  let index = 0;
  while (formData.get(`items[${index}].itemName`)) {
    const itemName = formData.get(`items[${index}].itemName`) as string;
    const price = parseFloat(formData.get(`items[${index}].price`) as string);

    // Lấy danh sách userIds cho món này
    const userIds: string[] = [];
    let userIndex = 0;
    while (formData.get(`items[${index}].userIds[${userIndex}]`)) {
      const userId = formData.get(`items[${index}].userIds[${userIndex}]`) as string;
      if (userId) {
        userIds.push(userId);
      }
      userIndex++;
    }

    // Lấy danh sách userNames tương ứng
    const userNames: string[] = [];
    userIndex = 0;
    while (formData.get(`items[${index}].userNames[${userIndex}]`)) {
      const userName = formData.get(`items[${index}].userNames[${userIndex}]`) as string;
      if (userName) {
        userNames.push(userName);
      }
      userIndex++;
    }

    // Validation: Mỗi món phải có ít nhất 1 người đặt
    if (itemName && !isNaN(price) && price > 0) {
      if (userIds.length === 0) {
        return Response.json(
          { error: `Món "${itemName}" chưa có người đặt. Vui lòng chọn ít nhất một người đặt.` },
          { status: 400 }
        );
      }

      // Tạo OrderItem cho mỗi người đặt món này
      userIds.forEach((userId, idx) => {
        itemsData.push({
          userId,
          userName: userNames[idx] || "",
          itemName,
          price,
        });
      });
    }
    index++;
  }

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

  if (isNaN(finalAmount) || finalAmount <= 0) {
    return Response.json(
      { error: "Tổng tiền phải trả phải lớn hơn 0" },
      { status: 400 }
    );
  }

  if (finalAmount > totalItemsPrice) {
    return Response.json(
      {
        error: `Tổng tiền phải trả (${finalAmount.toLocaleString()} VND) không thể lớn hơn tổng giá các món (${totalItemsPrice.toLocaleString()} VND)`,
      },
      { status: 400 }
    );
  }

  // Tính giảm giá tự động
  const discount = calculateDiscount(totalItemsPrice, finalAmount);
  const discountPerItem = calculateDiscountPerItem(discount, itemsData.length);

  try {
    // Update order: xóa items cũ và tạo items mới
    await db.order.update({
      where: { id: orderId },
      data: {
        weekId,
        description: description.trim(),
        totalAmount: totalItemsPrice,
        discount,
        finalAmount,
        items: {
          deleteMany: {}, // Xóa tất cả items cũ
          create: itemsData.map((item) => {
            const finalPrice = calculateFinalPrice(item.price, discountPerItem);
            return {
              userId: item.userId,
              itemName: item.itemName,
              price: item.price,
              discountShare: discountPerItem,
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

interface OrderItem {
  userIds: string[];
  userNames: string[];
  itemName: string;
  price: number;
}

export default function EditOrder() {
  const { order, users, weeks, initialItems } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [items, setItems] = useState<OrderItem[]>(initialItems);
  const [finalAmount, setFinalAmount] = useState<number>(order.finalAmount);
  const [selectedWeekId, setSelectedWeekId] = useState<string>(order.weekId);
  const [description, setDescription] = useState<string>(order.description || "");
  const [openDropdowns, setOpenDropdowns] = useState<Set<number>>(new Set());
  const dropdownRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Update state khi initialItems thay đổi (sau khi load)
  useEffect(() => {
    setItems(initialItems);
    setFinalAmount(order.finalAmount);
    setSelectedWeekId(order.weekId);
    setDescription(order.description || "");
  }, [initialItems, order]);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      let clickedInside = false;

      openDropdowns.forEach((index) => {
        const dropdown = dropdownRefs.current.get(index);
        if (dropdown && dropdown.contains(target)) {
          clickedInside = true;
        }
      });

      if (!clickedInside && openDropdowns.size > 0) {
        setOpenDropdowns(new Set());
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openDropdowns]);

  const handleAddItem = () => {
    setItems([...items, { userIds: [], userNames: [], itemName: "", price: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (
    index: number,
    field: keyof OrderItem,
    value: string | number
  ) => {
    setItems((prevItems) => {
      const newItems = [...prevItems];
      newItems[index] = { ...newItems[index], [field]: value };
      return newItems;
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

        {/* Tổng giá các món và Tổng tiền phải trả */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tổng giá các món (VND)
            </label>
            <div className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-700">
              {(() => {
                return items
                  .reduce((sum, item) => {
                    return sum + (item.price || 0) * (item.userIds.length || 0);
                  }, 0)
                  .toLocaleString("vi-VN");
              })()}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              (Tổng giá = Giá món × Số người đặt món đó)
            </p>
          </div>
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
              value={finalAmount || ""}
              onChange={(e) => setFinalAmount(parseFloat(e.target.value) || 0)}
              required
              min="0"
              className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
              placeholder="500000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Giảm giá (VND)
            </label>
            <div className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-green-50 text-green-700 font-semibold">
              {(() => {
                const totalItemsPrice = items.reduce((sum, item) => {
                  return sum + (item.price || 0) * (item.userIds.length || 0);
                }, 0);
                const discount = totalItemsPrice - finalAmount;
                return discount > 0 ? discount.toLocaleString("vi-VN") : "0";
              })()}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              (Tự động tính: Tổng giá - Tổng tiền phải trả)
            </p>
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Người đặt (có thể chọn nhiều)
                    </label>
                    <div className="relative">
                      {/* Selected users as tags */}
                      {item.userIds.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2 p-2 border border-gray-300 rounded-md bg-gray-50 min-h-[42px]">
                          {item.userIds.map((userId) => {
                            const user = users.find((u) => u.id === userId);
                            if (!user) return null;
                            return (
                              <span
                                key={userId}
                                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                              >
                                {user.name}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newUserIds = item.userIds.filter((id) => id !== userId);
                                    const newUserNames = users
                                      .filter((u) => newUserIds.includes(u.id))
                                      .map((u) => u.name);
                                    setItems((prevItems) => {
                                      const newItems = [...prevItems];
                                      newItems[index] = {
                                        ...newItems[index],
                                        userIds: newUserIds,
                                        userNames: newUserNames,
                                      };
                                      return newItems;
                                    });
                                  }}
                                  className="ml-2 text-blue-600 hover:text-blue-800"
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Custom dropdown với checkbox */}
                      <div
                        className="relative"
                        ref={(el) => {
                          if (el) {
                            dropdownRefs.current.set(index, el);
                          } else {
                            dropdownRefs.current.delete(index);
                          }
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setOpenDropdowns((prev) => {
                              const newSet = new Set(prev);
                              if (newSet.has(index)) {
                                newSet.delete(index);
                              } else {
                                newSet.add(index);
                              }
                              return newSet;
                            });
                          }}
                          className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500 text-left flex items-center justify-between"
                        >
                          <span className="text-gray-500">
                            {item.userIds.length === 0
                              ? "-- Chọn thành viên --"
                              : `Đã chọn ${item.userIds.length} người`}
                          </span>
                          <svg
                            className={`w-5 h-5 text-gray-400 transition-transform ${
                              openDropdowns.has(index) ? "rotate-180" : ""
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </button>
                        {openDropdowns.has(index) && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                            {users.map((user) => {
                              const isSelected = item.userIds.includes(user.id);
                              return (
                                <label
                                  key={user.id}
                                  className="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {
                                      if (isSelected) {
                                        // Remove user
                                        const newUserIds = item.userIds.filter((id) => id !== user.id);
                                        const newUserNames = users
                                          .filter((u) => newUserIds.includes(u.id))
                                          .map((u) => u.name);
                                        setItems((prevItems) => {
                                          const newItems = [...prevItems];
                                          newItems[index] = {
                                            ...newItems[index],
                                            userIds: newUserIds,
                                            userNames: newUserNames,
                                          };
                                          return newItems;
                                        });
                                      } else {
                                        // Add user
                                        const newUserIds = [...item.userIds, user.id];
                                        const newUserNames = [...item.userNames, user.name];
                                        setItems((prevItems) => {
                                          const newItems = [...prevItems];
                                          newItems[index] = {
                                            ...newItems[index],
                                            userIds: newUserIds,
                                            userNames: newUserNames,
                                          };
                                          return newItems;
                                        });
                                      }
                                    }}
                                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 accent-blue-600"
                                  />
                                  <span className="ml-2 text-sm text-gray-700">{user.name}</span>
                                </label>
                              );
                            })}
                            {users.length === 0 && (
                              <div className="px-4 py-2 text-sm text-gray-500 text-center">
                                Chưa có thành viên nào
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Hidden inputs for form submission */}
                    {item.userIds.map((userId, userIndex) => {
                      const user = users.find((u) => u.id === userId);
                      return (
                        <input
                          key={userIndex}
                          type="hidden"
                          name={`items[${index}].userIds[${userIndex}]`}
                          value={userId}
                        />
                      );
                    })}
                    {item.userNames.map((userName, userIndex) => (
                      <input
                        key={userIndex}
                        type="hidden"
                        name={`items[${index}].userNames[${userIndex}]`}
                        value={userName}
                      />
                    ))}
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
                        const val = e.target.value === "" ? 0 : parseFloat(e.target.value) || 0;
                        handleItemChange(index, "price", val);
                      }}
                      required
                      min="0"
                      className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="100000"
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

