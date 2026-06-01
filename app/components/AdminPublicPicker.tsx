import { useState } from "react";
import { boardUrlForAdmin } from "~/lib/admin.shared";
import type { PublicAdminSummary } from "~/lib/admin.shared";

type Props = {
  title: string;
  description: string;
  admins: PublicAdminSummary[];
  showLoginLink?: boolean;
};

export function AdminPublicPicker({
  title,
  description,
  admins,
  showLoginLink = true,
}: Props) {
  const [filter, setFilter] = useState("");

  const normalized = filter.trim().toLowerCase();
  const filtered = admins.filter((a) => {
    if (!normalized) return true;
    const label = (a.displayName || a.userName).toLowerCase();
    return (
      label.includes(normalized) ||
      a.slug.toLowerCase().includes(normalized) ||
      a.userName.toLowerCase().includes(normalized)
    );
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
          {description ? (
            <p className="text-gray-600">{description}</p>
          ) : null}
        </div>
        <a
          href="/payment"
          className="shrink-0 self-start px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 text-sm font-medium"
        >
          Đóng họ
        </a>
      </div>

      {admins.length > 1 && (
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Lọc theo tên hoặc slug..."
          className="w-full mb-6 px-4 py-2 border border-gray-300 rounded-md text-gray-900 focus:ring-blue-500 focus:border-blue-500"
        />
      )}

      {admins.length === 0 ? (
        <p className="text-gray-500 text-center py-8">Chưa có nhóm nào.</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-8">Không tìm thấy nhóm phù hợp.</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((admin) => {
            const label = admin.displayName || admin.userName;
            return (
              <li
                key={admin.slug}
                className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div>
                  <p className="font-semibold text-gray-900">{label}</p>
                  <p className="text-sm text-gray-500">slug: {admin.slug}</p>
                  {!admin.bankConfigured && (
                    <p className="text-xs text-amber-600 mt-1">
                      Chưa cấu hình ngân hàng — QR có thể chưa hiển thị
                    </p>
                  )}
                </div>
                <a
                  href={boardUrlForAdmin(admin.slug)}
                  className="shrink-0 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100"
                >
                  Board tổng hợp
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {showLoginLink && (
        <p className="mt-8 text-center text-sm text-gray-500">
          <a href="/login" className="text-blue-600 hover:underline">
            Đăng nhập quản trị
          </a>
        </p>
      )}
    </div>
  );
}
