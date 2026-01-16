import type { Route } from "./+types/payment";
import { useLoaderData, useNavigate } from "react-router";
import { useState, useRef, useEffect } from "react";
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
    const userId = url.searchParams.get("userId")?.trim() || null;

    // Lấy tất cả users để hiển thị trong select
    const allUsers = await db.user.findMany({
        orderBy: {
            name: "asc",
        },
    });

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

    if (userId) {
        // Tìm user theo userId
        const user = await db.user.findUnique({
            where: { id: userId },
        });

        if (user) {
            // Với user này, tìm các tuần mà họ chưa đóng tiền
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

    return { unpaidWeeks, allUsers, selectedUserId: userId };
}

export default function Payment() {
    const { unpaidWeeks, allUsers, selectedUserId } = useLoaderData<typeof loader>();
    const navigate = useNavigate();
    const [selectedUser, setSelectedUser] = useState<string>(selectedUserId || "");
    const [searchInput, setSearchInput] = useState<string>("");
    const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [qrPopup, setQrPopup] = useState<{ isOpen: boolean; qrUrl: string; userName: string; amount: number }>({
        isOpen: false,
        qrUrl: "",
        userName: "",
        amount: 0,
    });

    // Lấy tên user đã chọn
    const selectedUserName = allUsers.find((u) => u.id === selectedUser)?.name || "";

    // Filter users dựa trên search input
    const filteredUsers = allUsers.filter((user) =>
        user.name.toLowerCase().includes(searchInput.toLowerCase())
    );

    // Click outside để đóng dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
                setSearchInput("");
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("vi-VN", {
            style: "currency",
            currency: "VND",
        }).format(amount);
    };


    const handleUserChange = (userId: string) => {
        setSelectedUser(userId);
        setSearchInput("");
        setIsDropdownOpen(false);
        const url = new URL(window.location.href);
        if (userId) {
            url.searchParams.set("userId", userId);
        } else {
            url.searchParams.delete("userId");
        }
        navigate(url.pathname + url.search);
    };

    const handleClearSelection = () => {
        setSelectedUser("");
        setSearchInput("");
        setIsDropdownOpen(false);
        const url = new URL(window.location.href);
        url.searchParams.delete("userId");
        navigate(url.pathname + url.search);
    };

    const handleInputFocus = () => {
        setIsDropdownOpen(true);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchInput(e.target.value);
        setIsDropdownOpen(true);
    };

    const handleOpenQR = (amount: number, userName: string, startDate: Date) => {
        const qrUrl = generateQRCodeUrl(amount, userName, startDate);
        setQrPopup({
            isOpen: true,
            qrUrl,
            userName,
            amount,
        });
    };

    const handleCloseQR = () => {
        setQrPopup({
            isOpen: false,
            qrUrl: "",
            userName: "",
            amount: 0,
        });
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

                {/* Searchable Select user */}
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
                                    placeholder={selectedUser ? selectedUserName : "-- Chọn người --"}
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
                                                    className={`px-4 py-2 cursor-pointer text-gray-900 hover:bg-blue-50 ${selectedUser === user.id ? "bg-blue-100 font-medium" : ""
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

            {/* Table hiển thị các tuần chưa đóng tiền */}
            {selectedUserId ? (
                unpaidWeeks.length > 0 ? (
                    <div className="bg-white rounded-lg shadow overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-xl font-semibold text-gray-900">
                                Các tuần {unpaidWeeks[0]?.userName || ""} chưa đóng tiền
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
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
                                    {unpaidWeeks.map((item, index) => (
                                        <tr key={`${item.week.id}-${item.userId}-${index}`}>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">
                                                    {item.userName}
                                                </div>
                                            </td>
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
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenQR(item.amount, item.userName, item.week.startDate)}
                                                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
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
                                                </button>
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
                            Không có tuần nào chưa đóng tiền cho người này.
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

            {/* QR Code Popup */}
            {qrPopup.isOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center"
                    onClick={handleCloseQR}
                >
                    <div className="fixed inset-0 bg-black opacity-50"></div>
                    <div
                        className="relative bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 opacity-100"
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
                                <svg
                                    className="w-6 h-6"
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
                            </button>
                        </div>
                        <div className="text-center mb-4">
                            <p className="text-sm text-gray-600 mb-1">
                                <span className="font-medium">{qrPopup.userName}</span>
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

