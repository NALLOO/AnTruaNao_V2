import type { Route } from "./+types/payment";
import { useLoaderData, useNavigate } from "react-router";
import { useState, useRef, useEffect, useMemo } from "react";
import { db } from "~/lib/db.server";
import type { UnpaidWeekRow } from "~/lib/payment.server";
import { getUnpaidWeeksForUserAcrossAdmins } from "~/lib/payment.server";
import {
  generateQRCodeUrl,
  generateTotalQRCodeUrl,
  formatDate,
} from "~/lib/order.utils";
import type { AdminBankConfig } from "~/lib/admin.shared";
import type { PublicAdminSummary } from "~/lib/admin.shared";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Đóng họ - An Trua Nao" },
    { name: "description", content: "Xem và đóng tiền các tuần chưa thanh toán" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { getAdminBySlug, listPublicAdmins } = await import("~/lib/admin.server");
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId")?.trim() || null;
  const adminSlugParam = url.searchParams.get("admin")?.trim() ?? "";

  const admins = await listPublicAdmins();
  const allUsers = await db.user.findMany({ orderBy: { name: "asc" } });

  let adminSlug: string | null = null;
  let boardTitle: string | null = null;
  let invalidSlug = false;

  if (adminSlugParam) {
    const admin = await getAdminBySlug(adminSlugParam);
    if (!admin) {
      invalidSlug = true;
    } else {
      adminSlug = admin.slug;
      boardTitle = admin.displayName || admin.userName;
    }
  }

  let unpaidWeeks: UnpaidWeekRow[] = [];
  let filterAdminId: string | undefined;
  if (adminSlugParam && !invalidSlug && adminSlug) {
    const admin = await getAdminBySlug(adminSlugParam);
    filterAdminId = admin?.id;
  }

  if (userId) {
    unpaidWeeks = await getUnpaidWeeksForUserAcrossAdmins(
      userId,
      filterAdminId,
    );
  }

  return {
    admins,
    unpaidWeeks,
    allUsers,
    selectedUserId: userId,
    adminSlug: invalidSlug ? null : adminSlug,
    boardTitle: invalidSlug ? null : boardTitle,
    invalidSlug,
    isAllAdmins: !adminSlugParam || invalidSlug || !adminSlug,
  };
}

function groupByAdmin(rows: UnpaidWeekRow[]) {
  const map = new Map<
    string,
    { boardTitle: string; adminSlug: string; rows: UnpaidWeekRow[] }
  >();
  for (const row of rows) {
    const existing = map.get(row.adminSlug);
    if (existing) {
      existing.rows.push(row);
    } else {
      map.set(row.adminSlug, {
        adminSlug: row.adminSlug,
        boardTitle: row.boardTitle,
        rows: [row],
      });
    }
  }
  return [...map.values()];
}

export default function Payment() {
  const {
    unpaidWeeks,
    allUsers,
    selectedUserId,
    admins,
    adminSlug,
    boardTitle,
    invalidSlug,
    isAllAdmins,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [selectedUser, setSelectedUser] = useState<string>(selectedUserId || "");
  const [searchInput, setSearchInput] = useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [qrPopup, setQrPopup] = useState<{
    isOpen: boolean;
    qrUrl: string;
    userName: string;
    amount: number;
  }>({
    isOpen: false,
    qrUrl: "",
    userName: "",
    amount: 0,
  });

  const selectedUserName =
    allUsers.find((u) => u.id === selectedUser)?.name || "";

  const filteredUsers = allUsers.filter((user) =>
    user.name.toLowerCase().includes(searchInput.toLowerCase()),
  );

  const groupedUnpaid = useMemo(
    () => groupByAdmin(unpaidWeeks),
    [unpaidWeeks],
  );

  const showBoardColumn = isAllAdmins && groupedUnpaid.length > 0;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
        setSearchInput("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const buildPaymentUrl = (admin: string | null, userId: string | null) => {
    const url = new URL("/payment", window.location.origin);
    if (admin) url.searchParams.set("admin", admin);
    if (userId) url.searchParams.set("userId", userId);
    return url.pathname + url.search;
  };

  const handleAdminChange = (slug: string) => {
    const url = new URL(window.location.href);
    if (slug) {
      url.searchParams.set("admin", slug);
    } else {
      url.searchParams.delete("admin");
    }
    navigate(url.pathname + url.search);
  };

  const handleUserChange = (userId: string) => {
    setSelectedUser(userId);
    setSearchInput("");
    setIsDropdownOpen(false);
    navigate(buildPaymentUrl(adminSlug, userId || null));
  };

  const handleClearSelection = () => {
    setSelectedUser("");
    setSearchInput("");
    setIsDropdownOpen(false);
    navigate(buildPaymentUrl(adminSlug, null));
  };

  const handleInputFocus = () => setIsDropdownOpen(true);
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
    setIsDropdownOpen(true);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(amount);

  const handleOpenQR = (
    amount: number,
    userName: string,
    startDate: Date,
    bank: AdminBankConfig | null,
  ) => {
    if (!bank) return;
    const qrUrl = generateQRCodeUrl(amount, userName, startDate, bank);
    setQrPopup({ isOpen: true, qrUrl, userName, amount });
  };

  const handleOpenTotalQR = (
    amount: number,
    userName: string,
    bank: AdminBankConfig | null,
  ) => {
    if (!bank) return;
    const qrUrl = generateTotalQRCodeUrl(amount, userName, bank);
    setQrPopup({ isOpen: true, qrUrl, userName, amount });
  };

  const handleCloseQR = () => {
    setQrPopup({ isOpen: false, qrUrl: "", userName: "", amount: 0 });
  };

  const boardHref = adminSlug
    ? `/?admin=${encodeURIComponent(adminSlug)}`
    : "/";

  const renderUnpaidTable = (
    rows: UnpaidWeekRow[],
    options: { showBoardColumn: boolean; showGroupTitle?: string },
  ) => {
    const total =
      Math.round(rows.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
    const groupBank = rows[0]?.bankConfig ?? null;
    const userLabel = rows[0]?.userName || selectedUserName;

    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {options.showGroupTitle ? (
          <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">
              {options.showGroupTitle}
            </h2>
            <p className="text-xs text-gray-500">slug: {rows[0]?.adminSlug}</p>
          </div>
        ) : (
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              Các tuần {userLabel} chưa đóng tiền
            </h2>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {options.showBoardColumn && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nhóm
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tên người
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tên tuần
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thời gian
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Số tiền cần đóng
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  QR chuyển tiền
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.map((item, index) => (
                <tr key={`${item.adminSlug}-${item.week.id}-${index}`}>
                  {options.showBoardColumn && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.boardTitle}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {item.userName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.week.name || "Không có tên"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(item.week.startDate)} -{" "}
                    {formatDate(item.week.endDate)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">
                    {formatCurrency(item.amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {item.bankConfig ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenQR(
                            item.amount,
                            item.userName,
                            item.week.startDate,
                            item.bankConfig,
                          )
                        }
                        className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        QR Code
                      </button>
                    ) : (
                      <span className="text-xs text-amber-600">
                        Chưa cấu hình NH
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr>
                <td
                  colSpan={options.showBoardColumn ? 4 : 3}
                  className="px-6 py-4 text-right text-sm font-semibold text-gray-900"
                >
                  Tổng cộng
                </td>
                <td className="px-6 py-4 text-right text-sm font-bold text-gray-900">
                  {formatCurrency(total)}
                </td>
                <td className="px-6 py-4 text-center">
                  {groupBank ? (
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenTotalQR(total, userLabel, groupBank)
                      }
                      className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      QR tổng
                    </button>
                  ) : null}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Đóng họ
            {boardTitle && !isAllAdmins ? ` — ${boardTitle}` : ""}
          </h1>
          <a
            href={boardHref}
            className="self-start px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm"
          >
            Board tổng hợp
          </a>
        </div>

        {invalidSlug && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
            Không tìm thấy nhóm với slug đó. Đang hiển thị tất cả nhóm.
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <label
              htmlFor="select-admin"
              className="text-sm font-medium text-gray-700 whitespace-nowrap"
            >
              Chọn board:
            </label>
            <select
              id="select-admin"
              value={adminSlug ?? ""}
              onChange={(e) => handleAdminChange(e.target.value)}
              className="w-full sm:max-w-md px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Tất cả nhóm</option>
              {admins.map((a: PublicAdminSummary) => (
                <option key={a.slug} value={a.slug}>
                  {(a.displayName || a.userName) + ` (${a.slug})`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <label
              htmlFor="select-user"
              className="text-sm font-medium text-gray-700 whitespace-nowrap"
            >
              Chọn người:
            </label>
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1" ref={dropdownRef}>
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    id="select-user"
                    value={isDropdownOpen ? searchInput : selectedUserName || ""}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    placeholder={
                      selectedUser ? selectedUserName : "-- Chọn người --"
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen(!isDropdownOpen);
                      if (!isDropdownOpen) {
                        setSearchInput("");
                        inputRef.current?.focus();
                      }
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label="Mở danh sách"
                  >
                    <svg
                      className={`w-5 h-5 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
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
                </div>
                {isDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                    {filteredUsers.length > 0 ? (
                      <ul className="py-1">
                        {filteredUsers.map((user) => (
                          <li
                            key={user.id}
                            onClick={() => handleUserChange(user.id)}
                            className={`px-4 py-2 cursor-pointer text-gray-900 hover:bg-blue-50 ${
                              selectedUser === user.id
                                ? "bg-blue-100 font-medium"
                                : ""
                            }`}
                          >
                            {user.name}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="px-4 py-2 text-gray-500 text-sm">
                        Không tìm thấy
                      </div>
                    )}
                  </div>
                )}
              </div>
              {selectedUserId && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
                  title="Xóa lựa chọn"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedUserId ? (
        unpaidWeeks.length > 0 ? (
          isAllAdmins && groupedUnpaid.length > 1 ? (
            <div className="space-y-8">
              {groupedUnpaid.map((group) => (
                <div key={group.adminSlug}>
                  {renderUnpaidTable(group.rows, {
                    showBoardColumn: false,
                    showGroupTitle: group.boardTitle,
                  })}
                </div>
              ))}
            </div>
          ) : (
            renderUnpaidTable(unpaidWeeks, {
              showBoardColumn: showBoardColumn && groupedUnpaid.length === 1,
            })
          )
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <p className="text-yellow-800">
              Không có tuần nào chưa đóng tiền cho người này
              {isAllAdmins ? " trên các nhóm đã chọn" : ""}.
            </p>
          </div>
        )
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <p className="text-blue-800">
            Chọn người để xem các tuần chưa đóng tiền
            {isAllAdmins
              ? " trên tất cả các board"
              : boardTitle
                ? ` của ${boardTitle}`
                : ""}
            .
          </p>
        </div>
      )}

      {qrPopup.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={handleCloseQR}
        >
          <div className="fixed inset-0 bg-black opacity-50" />
          <div
            className="relative bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                QR Code thanh toán
              </h3>
              <button
                type="button"
                onClick={handleCloseQR}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="text-center mb-4">
              <p className="text-sm text-gray-600 font-medium">
                {qrPopup.userName}
              </p>
              <p className="text-lg font-bold text-gray-900">
                {formatCurrency(qrPopup.amount)}
              </p>
            </div>
            <div className="flex justify-center mb-4">
              <img
                src={qrPopup.qrUrl}
                alt="QR Code thanh toán"
                className="w-full max-w-xs border border-gray-200 rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
