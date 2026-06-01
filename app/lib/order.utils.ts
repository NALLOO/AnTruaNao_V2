import type { AdminBankConfig } from "~/lib/admin.shared";

/**
 * Chênh lệch giữa tổng niêm yết và tiền thực trả:
 * tham số 1 − tham số 2 (ví dụ: tổng món hoặc tổng món+ship, và tổng tiền phải trả)
 */
export function calculateDiscount(
  grossBeforePay: number,
  finalAmount: number
): number {
  return Math.round((grossBeforePay - finalAmount) * 100) / 100;
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

/** Tỷ lệ thanh toán: tiền phải trả / (tổng món + tiền ship) */
export function calculatePaymentRatio(
  itemsSubtotal: number,
  shippingFee: number,
  finalAmount: number
): number {
  const grossTotal = itemsSubtotal + shippingFee;
  if (grossTotal === 0) return 0;
  return finalAmount / grossTotal;
}

/** Ship chia đều theo số suất (số dòng OrderItem). */
export function calculateShippingPerPortion(
  shippingFee: number,
  portionCount: number
): number {
  if (portionCount === 0) return 0;
  return shippingFee / portionCount;
}

/** Một suất đặt món (sau khi nhân số lượng — mỗi suất một phần chia ship / giảm giá). */
export interface OrderFormPortion {
  userId: string;
  itemName: string;
  price: number;
}

/**
 * Đọc `items[i].itemName`, `items[i].price`, `items[i].lines[j].userId|quantity` từ FormData.
 * Mỗi dòng người đặt có số lượng ≥ 1 được mở rộng thành nhiều suất (cùng giá đơn vị).
 */
export function parseOrderItemsFromFormData(formData: FormData):
  | { ok: true; portions: OrderFormPortion[] }
  | { ok: false; error: string } {
  const portions: OrderFormPortion[] = [];
  let index = 0;
  while (formData.get(`items[${index}].itemName`)) {
    const itemName = formData.get(`items[${index}].itemName`) as string;
    const price = parseFloat(formData.get(`items[${index}].price`) as string);

    if (itemName && itemName.trim()) {
      if (!Number.isFinite(price)) {
        return {
          ok: false,
          error: `Món "${itemName}" có giá không hợp lệ`,
        };
      }

      const lines: Array<{ userId: string; quantity: number }> = [];
      let lineIndex = 0;
      while (formData.has(`items[${index}].lines[${lineIndex}].userId`)) {
        const userId = String(
          formData.get(`items[${index}].lines[${lineIndex}].userId`) ?? ""
        ).trim();
        const qtyRaw = formData.get(
          `items[${index}].lines[${lineIndex}].quantity`
        );
        let quantity = parseInt(String(qtyRaw), 10);
        if (!Number.isFinite(quantity) || quantity < 1) {
          quantity = 1;
        }

        if (userId) {
          lines.push({ userId, quantity });
        }
        lineIndex++;
      }

      if (lines.length === 0) {
        return {
          ok: false,
          error: `Món "${itemName.trim()}" chưa có người đặt. Vui lòng chọn ít nhất một người đặt.`,
        };
      }

      const trimmedName = itemName.trim();
      for (const { userId, quantity } of lines) {
        for (let k = 0; k < quantity; k++) {
          portions.push({
            userId,
            itemName: trimmedName,
            price,
          });
        }
      }
    }
    index++;
  }

  return { ok: true, portions };
}

/**
 * Phân bổ tiền phải trả cho từng suất:
 * suất i = tỷ lệ × (giá món i + ship / N). Tổng (lý thuyết) = finalAmount.
 * Làm tròn 2 chữ số và cộng phần lệch vào suất cuối để tổng khớp finalAmount.
 */
export function allocateFinalAmountToPortions(
  itemPrices: number[],
  shippingFee: number,
  finalAmount: number
): number[] {
  const n = itemPrices.length;
  if (n === 0) return [];
  const itemsSubtotal = itemPrices.reduce((a, b) => a + b, 0);
  const grossTotal = itemsSubtotal + shippingFee;
  if (grossTotal === 0) return itemPrices.map(() => 0);
  const ratio = finalAmount / grossTotal;
  const shipPer = shippingFee / n;
  const rounded = itemPrices.map((p) =>
    Math.round((p + shipPer) * ratio * 100) / 100
  );
  const sum = rounded.reduce((a, b) => a + b, 0);
  const diff = Math.round((finalAmount - sum) * 100) / 100;
  if (diff !== 0) {
    rounded[n - 1] = Math.round((rounded[n - 1] + diff) * 100) / 100;
  }
  return rounded;
}

/**
 * Chiết khấu theo niêm yết một suất (giá món + phần ship phân bổ) so với trả thực.
 */
export function calculatePortionDiscountShare(
  itemPrice: number,
  shippingPerPortion: number,
  finalPrice: number,
  paymentRatio: number
): number {
  if (paymentRatio === 0) return 0;
  const nominal = itemPrice + shippingPerPortion;
  return Math.round((nominal - finalPrice / paymentRatio) * 100) / 100;
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
 * Ship đã gộp vào từng suất qua finalPrice (allocateFinalAmountToPortions).
 */
export function applyShippingToUserTotals(
  itemTotals: UserTotal[],
  _orders: Array<{
    shippingFee: number;
    items: Array<{ userId: string; userName: string }>;
  }>
): UserTotal[] {
  return itemTotals.map((t) => ({ ...t }));
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

function buildVietQrImageUrl(
  bank: AdminBankConfig,
  amount: number,
  addInfo: string
): string {
  const amountValue = Math.round(amount);
  const encodedAddInfo = encodeURIComponent(addInfo);
  const encodedAccountName = encodeURIComponent(bank.accountHolderName);
  const imageId = `${bank.bankCode}-${bank.accountNumber}-compact2.jpg`;
  return `https://img.vietqr.io/image/${imageId}?amount=${amountValue}&addInfo=${encodedAddInfo}&accountName=${encodedAccountName}`;
}

/**
 * Tạo URL QR code chuyển tiền
 * Nội dung chuyển khoản: "tên người tien com ngày bắt đầu tuần"
 */
export function generateQRCodeUrl(
  amount: number,
  userName: string,
  startDate: Date,
  bank: AdminBankConfig
): string {
  const formattedDate = formatDate(startDate);
  const addInfo = `${userName} tien com ${formattedDate}`;
  return buildVietQrImageUrl(bank, amount, addInfo);
}

/**
 * QR một lần cho tổng tiền cơm nhiều tuần (nội dung: "tên người tien com tong cong")
 */
export function generateTotalQRCodeUrl(
  amount: number,
  userName: string,
  bank: AdminBankConfig
): string {
  const addInfo = `${userName} tien com tong cong`;
  return buildVietQrImageUrl(bank, amount, addInfo);
}

