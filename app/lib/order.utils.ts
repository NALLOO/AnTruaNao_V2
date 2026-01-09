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

