import type { Route } from "./+types/api.vnpay.webhook";
import { db } from "~/lib/db.server";
import { calculateUserTotals } from "~/lib/order.utils";

/**
 * Hàm xử lý webhook data (dùng chung cho cả GET và POST)
 */
async function processWebhookData(body: Record<string, string>) {
  // VNPay webhook thường gửi các thông tin sau:
  // - vnp_Amount: Số tiền (đã nhân 100, ví dụ: 100000 = 1000 VND)
  // - vnp_TransactionStatus: Trạng thái giao dịch (00 = thành công)
  // - vnp_TxnRef: Mã tham chiếu giao dịch
  // - vnp_OrderInfo: Nội dung chuyển khoản (chứa thông tin user và week)
  // - vnp_ResponseCode: Mã phản hồi
  // - vnp_SecureHash: Chữ ký bảo mật

  const amount = parseFloat(body.vnp_Amount as string) / 100; // VNPay gửi số tiền đã nhân 100
  const transactionStatus = body.vnp_TransactionStatus as string;
  const orderInfo = decodeURIComponent(body.vnp_OrderInfo as string || ""); // Decode URL encoding
  const responseCode = body.vnp_ResponseCode as string;
  const txnRef = body.vnp_TxnRef as string;
  const secureHash = body.vnp_SecureHash as string;

  // Kiểm tra giao dịch thành công
  if (transactionStatus !== "00" || responseCode !== "00") {
    return Response.json({ error: "Transaction failed" }, { status: 400 });
  }


  // Parse nội dung chuyển khoản để lấy thông tin user và week
  // Format: "tên người tien com ngày bắt đầu tuần"
  // Ví dụ: "nghiapd tien com 12/01/2026" hoặc "Nguyen Van A tien com 12/01/2026"

  const orderInfoLower = orderInfo.trim().toLowerCase();
  const tienComIndex = orderInfoLower.indexOf("tien com");

  if (tienComIndex === -1) {
    return Response.json({ error: "Invalid order info format" }, { status: 400 });
  }

  // Lấy tên người (phần trước "tien com")
  const userName = orderInfo.substring(0, tienComIndex).trim();

  // Lấy phần ngày (phần sau "tien com")
  const datePart = orderInfo.substring(tienComIndex + "tien com".length).trim();
  const dateStr = datePart; // "12/01/2026"


  // Parse ngày từ format dd/MM/yyyy
  const [day, month, year] = dateStr.split("/").map(Number);
  if (!day || !month || !year) {
    return Response.json({ error: "Invalid date format" }, { status: 400 });
  }

  const weekStartDate = new Date(year, month - 1, day);

  // Tìm user theo tên
  const user = await db.user.findFirst({
    where: {
      name: {
        equals: userName,
        mode: "insensitive",
      },
    },
  });

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }


  // Tìm week theo startDate (tìm trong khoảng ±1 ngày để tránh lỗi timezone)
  const weekStart = new Date(weekStartDate);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStartDate);
  weekEnd.setHours(23, 59, 59, 999);

  const week = await db.week.findFirst({
    where: {
      startDate: {
        gte: weekStart,
        lte: weekEnd,
      },
      isFinalized: true, // Chỉ xử lý các tuần đã quyết toán
    },
  });

  if (!week) {
    return Response.json({ error: "Week not found" }, { status: 404 });
  }


  // Tính số tiền cần đóng của user trong tuần này


  const weekOrders = await db.order.findMany({
    where: { weekId: week.id },
    include: {
      items: {
        include: { user: true },
      },
    },
  });


  const weekItems = weekOrders.flatMap((order) =>
    order.items.map((item) => ({
      userId: item.userId,
      userName: item.user.name,
      finalPrice: item.finalPrice,
    }))
  );

  const weekUserTotals = calculateUserTotals(weekItems);
  const userTotal = weekUserTotals.find((u) => u.userId === user.id);

  if (!userTotal) {
    return Response.json({ error: "User has no orders in this week" }, { status: 400 });
  }

  // Kiểm tra số tiền có khớp không (cho phép sai số nhỏ do làm tròn)
  const amountDiff = Math.abs(amount - userTotal.totalAmount);
  if (amountDiff > 100) {
    // Cho phép sai số tối đa 100 VND
    return Response.json(
      { error: `Amount mismatch. Expected: ${userTotal.totalAmount}, Received: ${amount}` },
      { status: 400 }
    );
  }

  // Kiểm tra payment hiện tại trước khi update
  const existingPayment = await db.payment.findUnique({
    where: {
      userId_weekId: {
        userId: user.id,
        weekId: week.id,
      },
    },
  });

  // Cập nhật payment status
  const updatedPayment = await db.payment.upsert({
    where: {
      userId_weekId: {
        userId: user.id,
        weekId: week.id,
      },
    },
    update: {
      paid: true,
      paidAt: new Date(),
    },
    create: {
      userId: user.id,
      weekId: week.id,
      paid: true,
      paidAt: new Date(),
    },
  });



  return Response.json({
    success: true,
    message: "Payment updated successfully",
    userId: user.id,
    weekId: week.id,
    amount,
  });
}

/**
 * Loader để handle GET request (VNPay gửi webhook qua GET với query parameters)
 */
export async function loader({ request }: Route.LoaderArgs) {

  // VNPay gửi webhook qua GET với query parameters
  const url = new URL(request.url);
  const body: Record<string, string> = {};

  // Parse tất cả query parameters
  for (const [key, value] of url.searchParams.entries()) {
    body[key] = value;
  }


  // Xử lý webhook data
  return await processWebhookData(body);
}

/**
 * Webhook endpoint để nhận thông báo thanh toán từ VNPay
 * VNPay sẽ gửi POST request đến endpoint này sau khi có giao dịch
 */
export async function action({ request }: Route.ActionArgs) {
  // Log ngay đầu để đảm bảo function được gọi


  // Chỉ chấp nhận POST request
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {

    // Lấy dữ liệu từ VNPay webhook
    // VNPay thường gửi dưới dạng form-data (application/x-www-form-urlencoded)
    const contentType = request.headers.get("content-type") || "";

    let body: Record<string, string> = {};

    if (contentType.includes("application/json")) {
      // Nếu là JSON
      const jsonData = await request.json();
      body = jsonData;
    } else {
      // Nếu là form-data (phổ biến hơn với VNPay)
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    }

    // Xử lý webhook data (dùng chung function với GET request)
    return await processWebhookData(body);
  } catch (error) {

    return Response.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

