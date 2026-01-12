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

/**
 * Tạo URL QR code chuyển tiền
 * Nội dung chuyển khoản: "tên người tien com ngày bắt đầu tuần"
 * Ví dụ: "nghiapd tien com 12/01/2026"
 */
export function generateQRCodeUrl(
  amount: number,
  userName: string,
  startDate: Date
): string {
  const amountValue = Math.round(amount);
  const formattedDate = formatDate(startDate);
  // Nội dung: "tên người tien com ngày bắt đầu tuần"
  // Ví dụ: "nghiapd tien com 12/01/2026"
  const addInfo = `${userName} tien com ${formattedDate}`;
  const encodedAddInfo = encodeURIComponent(addInfo);
  return `https://img.vietqr.io/image/vpbank-2746520062001-compact2.jpg?amount=${amountValue}&addInfo=${encodedAddInfo}&accountName=PHAM%20DINH%20NGHIA`;
}

