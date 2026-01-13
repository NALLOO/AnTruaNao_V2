import type { Route } from "./+types/payment.return";
import { useLoaderData, Link } from "react-router";

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Kết quả thanh toán - An Trua Nao" },
    { name: "description", content: "Kết quả thanh toán VNPay" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  
  // VNPay sẽ redirect về với các query parameters:
  // - vnp_Amount: Số tiền
  // - vnp_BankCode: Mã ngân hàng
  // - vnp_BankTranNo: Mã giao dịch ngân hàng
  // - vnp_CardType: Loại thẻ
  // - vnp_OrderInfo: Nội dung đơn hàng
  // - vnp_PayDate: Ngày thanh toán
  // - vnp_ResponseCode: Mã phản hồi (00 = thành công)
  // - vnp_TmnCode: Merchant code
  // - vnp_TransactionNo: Mã giao dịch VNPay
  // - vnp_TransactionStatus: Trạng thái giao dịch (00 = thành công)
  // - vnp_TxnRef: Mã tham chiếu đơn hàng
  // - vnp_SecureHash: Chữ ký bảo mật

  const responseCode = url.searchParams.get("vnp_ResponseCode");
  const transactionStatus = url.searchParams.get("vnp_TransactionStatus");
  const orderInfo = url.searchParams.get("vnp_OrderInfo") || "";
  const amount = url.searchParams.get("vnp_Amount");
  const transactionNo = url.searchParams.get("vnp_TransactionNo");
  const txnRef = url.searchParams.get("vnp_TxnRef");

  // Kiểm tra thanh toán thành công
  const isSuccess = responseCode === "00" && transactionStatus === "00";

  // Parse nội dung đơn hàng để hiển thị thông tin
  let userName = "";
  let weekDate = "";
  
  if (orderInfo) {
    const orderInfoLower = orderInfo.trim().toLowerCase();
    const tienComIndex = orderInfoLower.indexOf("tien com");
    
    if (tienComIndex !== -1) {
      userName = orderInfo.substring(0, tienComIndex).trim();
      const datePart = orderInfo.substring(tienComIndex + "tien com".length).trim();
      weekDate = datePart;
    }
  }

  // Format số tiền
  const amountValue = amount ? parseFloat(amount) / 100 : 0; // VNPay gửi số tiền nhân 100

  return {
    isSuccess,
    userName,
    weekDate,
    amount: amountValue,
    transactionNo,
    txnRef,
    responseCode,
    transactionStatus,
  };
}

export default function PaymentReturn() {
  const {
    isSuccess,
    userName,
    weekDate,
    amount,
    transactionNo,
    txnRef,
  } = useLoaderData<typeof loader>();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(amount);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow-lg p-8">
        {isSuccess ? (
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
              <svg
                className="h-8 w-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Thanh toán thành công!
            </h1>
            <p className="text-gray-600 mb-6">
              Giao dịch của bạn đã được xử lý thành công.
            </p>

            <div className="bg-gray-50 rounded-lg p-6 mb-6 text-left">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Thông tin giao dịch
              </h2>
              <dl className="space-y-3">
                {userName && (
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-gray-500">Người thanh toán:</dt>
                    <dd className="text-sm text-gray-900">{userName}</dd>
                  </div>
                )}
                {weekDate && (
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-gray-500">Tuần:</dt>
                    <dd className="text-sm text-gray-900">{weekDate}</dd>
                  </div>
                )}
                {amount > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-gray-500">Số tiền:</dt>
                    <dd className="text-sm font-semibold text-gray-900">
                      {formatCurrency(amount)}
                    </dd>
                  </div>
                )}
                {transactionNo && (
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-gray-500">Mã giao dịch:</dt>
                    <dd className="text-sm text-gray-900 font-mono">{transactionNo}</dd>
                  </div>
                )}
                {txnRef && (
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-gray-500">Mã tham chiếu:</dt>
                    <dd className="text-sm text-gray-900 font-mono">{txnRef}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="text-sm text-gray-500 mb-6">
              <p>
                Trạng thái thanh toán sẽ được cập nhật tự động thông qua webhook.
                Vui lòng đợi vài giây để hệ thống xử lý.
              </p>
            </div>

            <div className="flex gap-4 justify-center">
              <Link
                to="/"
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
              >
                Về Dashboard
              </Link>
              <Link
                to="/payment"
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 cursor-pointer"
              >
                Xem thanh toán khác
              </Link>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
              <svg
                className="h-8 w-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Thanh toán không thành công
            </h1>
            <p className="text-gray-600 mb-6">
              Giao dịch của bạn không thể hoàn tất. Vui lòng thử lại.
            </p>

            <div className="flex gap-4 justify-center">
              <Link
                to="/payment"
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
              >
                Thử lại
              </Link>
              <Link
                to="/"
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 cursor-pointer"
              >
                Về Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

