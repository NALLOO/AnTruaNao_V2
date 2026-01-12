import type { Route } from "./+types/payment";
import { useLoaderData, useNavigate } from "react-router";
import { useState } from "react";
import { db } from "~/lib/db.server";
import { calculateUserTotals, generateQRCodeUrl, formatDate } from "~/lib/order.utils";

export function meta({ }: Route.MetaArgs) {
    return [
        { title: "Đóng họ - An Trua Nao" },
        { name: "description", content: "Xem và đóng tiền các tuần chưa thanh toán" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    const url = new URL(request.url);
    const searchName = url.searchParams.get("searchName")?.trim() || null;

    // Lấy tất cả tuần đã quyết toán
    const allWeeks = await db.week.findMany({
        where: {
            isFinalized: true, // Chỉ lấy các tuần đã quyết toán
        },
        orderBy: {
            startDate: "desc",
        },
    });

    let unpaidWeeks: Array<{
        week: typeof allWeeks[0];
        amount: number;
        userName: string;
        userId: string;
    }> = [];

    if (searchName) {
        // Tìm user có tên chính xác (case-insensitive)
        const matchingUsers = await db.user.findMany({
            where: {
                name: {
                    equals: searchName,
                    mode: "insensitive",
                },
            },
        });

        if (matchingUsers.length > 0) {
            // Với mỗi user, tìm các tuần mà họ chưa đóng tiền
            for (const user of matchingUsers) {
                for (const week of allWeeks) {
                    // Lấy đơn hàng trong tuần
                    const weekOrders = await db.order.findMany({
                        where: { weekId: week.id },
                        include: {
                            items: {
                                include: { user: true },
                            },
                        },
                    });

                    // Tính userTotals cho tuần này
                    const weekItems = weekOrders.flatMap((order) =>
                        order.items.map((item) => ({
                            userId: item.userId,
                            userName: item.user.name,
                            finalPrice: item.finalPrice,
                        }))
                    );

                    const weekUserTotals = calculateUserTotals(weekItems);

                    // Tìm user trong danh sách
                    const userTotal = weekUserTotals.find((u) => u.userId === user.id);
                    if (!userTotal) continue; // User không có đơn hàng trong tuần này

                    // Lấy trạng thái thanh toán
                    const payment = await db.payment.findUnique({
                        where: {
                            userId_weekId: {
                                userId: user.id,
                                weekId: week.id,
                            },
                        },
                    });

                    // Chỉ thêm nếu chưa thanh toán
                    if (!payment || !payment.paid) {
                        unpaidWeeks.push({
                            week,
                            amount: userTotal.totalAmount,
                            userName: user.name,
                            userId: user.id,
                        });
                    }
                }
            }
        }
    }

    return { unpaidWeeks, searchName };
}

export default function Payment() {
    const { unpaidWeeks, searchName } = useLoaderData<typeof loader>();
    const navigate = useNavigate();
    const [searchInput, setSearchInput] = useState<string>(searchName || "");

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("vi-VN", {
            style: "currency",
            currency: "VND",
        }).format(amount);
    };


    const handleSearch = (name: string) => {
        const url = new URL(window.location.href);
        if (name.trim()) {
            url.searchParams.set("searchName", name.trim());
        } else {
            url.searchParams.delete("searchName");
        }
        navigate(url.pathname + url.search);
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSearch(searchInput);
    };

    const handleClearSearch = () => {
        setSearchInput("");
        const url = new URL(window.location.href);
        url.searchParams.delete("searchName");
        navigate(url.pathname + url.search);
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold text-gray-900">Đóng họ</h1>
                    <a
                        href="/"
                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                    >
                        ← Về Dashboard
                    </a>
                </div>

                {/* Search input */}
                <form onSubmit={handleSearchSubmit} className="flex items-center gap-4">
                    <label
                        htmlFor="search-name"
                        className="text-sm font-medium text-gray-700 whitespace-nowrap"
                    >
                        Tìm kiếm theo tên:
                    </label>
                    <div className="flex items-center gap-2 flex-1 max-w-md">
                        <input
                            type="text"
                            id="search-name"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Nhập tên để tìm kiếm"
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                        />
                        {searchName && (
                            <button
                                type="button"
                                onClick={handleClearSearch}
                                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
                                title="Xóa tìm kiếm"
                            >
                                ✕
                            </button>
                        )}
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                            Tìm kiếm
                        </button>
                    </div>
                </form>
            </div>

            {/* Table hiển thị các tuần chưa đóng tiền */}
            {searchName ? (
                unpaidWeeks.length > 0 ? (
                    <div className="bg-white rounded-lg shadow overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-xl font-semibold text-gray-900">
                                Các tuần {searchName} chưa đóng tiền
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
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
                                    {unpaidWeeks.map((item, index) => (
                                        <tr key={`${item.week.id}-${item.userId}-${index}`}>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">
                                                    {item.week.name || "Không có tên"}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-900">
                                                    {formatDate(item.week.startDate)} - {formatDate(item.week.endDate)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <div className="text-sm font-semibold text-gray-900">
                                                    {formatCurrency(item.amount)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                <a
                                                    href={generateQRCodeUrl(item.amount, item.userName, item.week.startDate)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                                                >
                                                    <svg
                                                        className="w-5 h-5 mr-2"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                        xmlns="http://www.w3.org/2000/svg"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                                                        />
                                                    </svg>
                                                    QR Code
                                                </a>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                        <p className="text-yellow-800">
                            Không có tuần nào mà {searchName} chưa đóng tiền.
                        </p>
                    </div>
                )
            ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
                    <p className="text-blue-800">
                        Vui lòng nhập tên người để tìm kiếm các tuần chưa đóng tiền.
                    </p>
                </div>
            )}
        </div>
    );
}

