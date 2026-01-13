/**
 * Tính toán giảm giá tự động
 * Giảm giá = Tổng giá các món - Tổng tiền phải trả
 */
export function calculateDiscount(
  totalItemsPrice: number,
  finalAmount: number
): number {
  return Math.round((totalItemsPrice - finalAmount) * 100) / 100;
}

/**
 * Tính toán phần giảm giá được chia cho từng món ăn
 * Giảm giá được chia đều cho mỗi món: Giảm giá / Tổng số món
 */
export function calculateDiscountPerItem(
  totalDiscount: number,
  totalItems: number
): number {
  if (totalItems === 0) return 0;
  return Math.round((totalDiscount / totalItems) * 100) / 100; // Làm tròn 2 chữ số thập phân
}

/**
 * Tính toán giá cuối cùng sau khi trừ phần giảm giá
 * Mỗi món trừ đi phần giảm giá chia đều
 */
export function calculateFinalPrice(
  itemPrice: number,
  discountPerItem: number
): number {
  return Math.round((itemPrice - discountPerItem) * 100) / 100;
}

/**
 * Tính tổng số tiền từng người phải trả trong một khoảng thời gian
 */
export interface UserTotal {
  userId: string;
  userName: string;
  totalAmount: number;
}

export function calculateUserTotals(
  orderItems: Array<{
    userId: string;
    userName: string;
    finalPrice: number;
  }>
): UserTotal[] {
  const userMap = new Map<string, { name: string; total: number }>();

  for (const item of orderItems) {
    const existing = userMap.get(item.userId);
    if (existing) {
      existing.total += item.finalPrice;
    } else {
      userMap.set(item.userId, {
        name: item.userName,
        total: item.finalPrice,
      });
    }
  }

  return Array.from(userMap.entries()).map(([userId, data]) => ({
    userId,
    userName: data.name,
    totalAmount: Math.round(data.total * 100) / 100,
  }));
}

/**
 * Format ngày theo định dạng Việt Nam (dd/MM/yyyy)
 */
export function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

import crypto from "crypto";

/**
 * Sắp xếp và encode object theo format VNPay
 * Encode key và value, thay %20 thành + (giống qs.stringify với encode: false)
 */
function sortAndEncodeObject(obj: Record<string, string | number>): Record<string, string> {
  const sorted: Record<string, string> = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    const value = String(obj[key]);
    // Encode key và value
    const encodedKey = encodeURIComponent(key);
    let encodedValue = encodeURIComponent(value);
    // Thay %20 thành + (theo format VNPay)
    encodedValue = encodedValue.replace(/%20/g, "+");
    sorted[encodedKey] = encodedValue;
  }
  return sorted;
}

/**
 * Tạo query string từ object đã được sort và encode
 * Giống như qs.stringify với { encode: false }
 */
function stringifyParams(params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  return sortedKeys
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

/**
 * Tạo secure hash cho VNPay payment
 * Theo đúng format của VNPay: encode key/value, thay %20 thành +, sort alphabet
 * 
 * Lưu ý: VNPay sử dụng HMAC SHA512
 * Format: key1=value1&key2=value2&... (sắp xếp theo alphabet, không bao gồm vnp_SecureHash)
 */
function createVNPaySecureHash(
  params: Record<string, string | number>,
  secretKey: string
): string {
  // Loại bỏ vnp_SecureHash nếu có (không được tính trong hash)
  const paramsForHash = { ...params };
  delete paramsForHash.vnp_SecureHash;
  
  // Sắp xếp và encode object (encode key/value, thay %20 thành +)
  const sortedAndEncoded = sortAndEncodeObject(paramsForHash);
  
  // Tạo signData từ params đã sort và encode
  // Giống như trong ví dụ: qs.stringify(sorted, { encode: false })
  const signData = stringifyParams(sortedAndEncoded);

  // Tạo hash SHA512 từ signData (dùng string, không cần Buffer)
  // Giống ví dụ: hmac.update(signData, 'utf8')
  const hmac = crypto.createHmac("sha512", secretKey);
  hmac.update(signData, "utf8");
  return hmac.digest("hex"); // lowercase (theo ví dụ VNPay)
}

/**
 * Tạo URL thanh toán VNPay
 * Nội dung chuyển khoản: "tên người tien com ngày bắt đầu tuần"
 * Ví dụ: "nghiapd tien com 12/01/2026"
 * 
 * Trả về payment URL trực tiếp của VNPay để người dùng click vào và thanh toán
 */
export function generateVNPayPaymentUrl(
  amount: number,
  userName: string,
  startDate: Date,
  userId?: string,
  weekId?: string
): string {
  const amountValue = Math.round(amount);
  const formattedDate = formatDate(startDate);
  
  // Nội dung chuyển khoản: "tên người tien com ngày bắt đầu tuần"
  // Ví dụ: "nghiapd tien com 12/01/2026"
  const orderInfo = `${userName} tien com ${formattedDate}`;
  
  // Tạo Order ID duy nhất (có thể dùng userId-weekId-timestamp)
  const timestamp = Date.now();
  const orderId = userId && weekId 
    ? `${userId}-${weekId}-${timestamp}`
    : `order-${timestamp}`;

  // Lấy thông tin VNPay từ environment variables
  const vnp_TmnCode = process.env.VNPAY_TMN_CODE;
  const vnp_SecretKey = process.env.VNPAY_SECRET_KEY;
  const vnp_Url = process.env.VNPAY_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
  const vnp_ReturnUrl = process.env.VNPAY_RETURN_URL;

  // Validation: Kiểm tra các tham số bắt buộc
  if (!vnp_TmnCode || vnp_TmnCode === "YOUR_MERCHANT_CODE") {
    throw new Error("VNPAY_TMN_CODE chưa được cấu hình trong environment variables");
  }
  if (!vnp_SecretKey || vnp_SecretKey === "YOUR_SECRET_KEY") {
    throw new Error("VNPAY_SECRET_KEY chưa được cấu hình trong environment variables");
  }
  if (!vnp_ReturnUrl) {
    throw new Error("VNPAY_RETURN_URL chưa được cấu hình trong environment variables");
  }

  // Format CreateDate theo yêu cầu VNPay: yyyyMMddHHmmss (14 chữ số)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const vnp_CreateDate = `${year}${month}${day}${hours}${minutes}${seconds}`;

  // Tạo các tham số cho VNPay (KHÔNG bao gồm vnp_SecureHash)
  // Lưu ý: Tất cả giá trị phải là string hoặc number (sẽ được convert khi encode)
  const vnp_Params: Record<string, string | number> = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: vnp_TmnCode.trim(), // Loại bỏ khoảng trắng nếu có
    vnp_Amount: amountValue * 100, // VNPay yêu cầu số tiền nhân 100
    vnp_CurrCode: "VND",
    vnp_TxnRef: orderId,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: "other",
    vnp_Locale: "vn",
    vnp_ReturnUrl: vnp_ReturnUrl.trim(), // Loại bỏ khoảng trắng
    vnp_IpAddr: "127.0.0.1", // VNPay sẽ tự detect IP thực tế
    vnp_CreateDate: vnp_CreateDate,
  };

  // Tạo secure hash từ params (KHÔNG bao gồm vnp_SecureHash)
  // Hàm này sẽ tự động sort, encode và tạo hash
  const vnp_SecureHash = createVNPaySecureHash(vnp_Params, vnp_SecretKey);
  
  // Thêm secure hash vào params
  vnp_Params.vnp_SecureHash = vnp_SecureHash;

  // Sắp xếp và encode toàn bộ params (bao gồm cả secure hash) để tạo query string
  const sortedAndEncodedParams = sortAndEncodeObject(vnp_Params);

  // Tạo query string từ params đã sort và encode
  // Giống như trong ví dụ: qs.stringify(sortObject(params), { encode: false })
  const queryString = stringifyParams(sortedAndEncodedParams);

  // Trả về payment URL trực tiếp
  const paymentUrl = `${vnp_Url}?${queryString}`;
  
  return paymentUrl;
}

/**
 * @deprecated Sử dụng generateVNPayPaymentUrl thay thế
 * Giữ lại để backward compatibility
 */
export function generateQRCodeUrl(
  amount: number,
  userName: string,
  startDate: Date,
  userId?: string,
  weekId?: string
): string {
  return generateVNPayPaymentUrl(amount, userName, startDate, userId, weekId);
}

