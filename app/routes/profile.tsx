import type { Route } from "./+types/profile";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { db } from "~/lib/db.server";
import { isAdminBankConfigured, boardUrlForAdmin } from "~/lib/admin.shared";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Hồ sơ - An Trua Nao" },
    { name: "description", content: "Cập nhật hồ sơ và tài khoản ngân hàng" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { requireAdminId } = await import("~/lib/session.server");
  const adminId = await requireAdminId(request);
  const admin = await db.admin.findUniqueOrThrow({ where: { id: adminId } });
  const url = new URL(request.url);
  const origin = url.origin;
  const boardUrl = `${origin}${boardUrlForAdmin(admin.slug)}`;
  const saved = url.searchParams.get("saved") === "1";
  const passwordSaved = url.searchParams.get("passwordSaved") === "1";

  return {
    admin,
    boardUrl,
    bankConfigured: isAdminBankConfigured(admin),
    saved,
    passwordSaved,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { requireAdminId } = await import("~/lib/session.server");
  const adminId = await requireAdminId(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "change-password") {
    const currentPassword = (formData.get("currentPassword") as string) ?? "";
    const newPassword = (formData.get("newPassword") as string) ?? "";
    const confirmPassword = (formData.get("confirmPassword") as string) ?? "";

    if (!currentPassword || !newPassword || !confirmPassword) {
      return Response.json(
        { error: "Vui lòng điền đầy đủ các trường mật khẩu" },
        { status: 400 },
      );
    }
    if (newPassword.length < 6) {
      return Response.json(
        { error: "Mật khẩu mới phải có ít nhất 6 ký tự" },
        { status: 400 },
      );
    }
    if (newPassword !== confirmPassword) {
      return Response.json(
        { error: "Mật khẩu mới và xác nhận không khớp" },
        { status: 400 },
      );
    }

    const admin = await db.admin.findUnique({ where: { id: adminId } });
    if (!admin || admin.password !== currentPassword) {
      return Response.json(
        { error: "Mật khẩu hiện tại không đúng" },
        { status: 400 },
      );
    }

    try {
      await db.admin.update({
        where: { id: adminId },
        data: { password: newPassword },
      });
      return Response.redirect(
        new URL("/profile?passwordSaved=1", request.url).toString(),
        302,
      );
    } catch (error) {
      console.error("Error changing password:", error);
      return Response.json(
        { error: "Đã xảy ra lỗi khi đổi mật khẩu" },
        { status: 500 },
      );
    }
  }

  const displayName = (formData.get("displayName") as string)?.trim() || null;
  const slug = (formData.get("slug") as string)?.trim() || "";
  const bankCode = (formData.get("bankCode") as string)?.trim() || "";
  const accountNumber = (formData.get("accountNumber") as string)?.trim() || "";
  const accountHolderName =
    (formData.get("accountHolderName") as string)?.trim() || "";

  if (!slug) {
    return Response.json(
      { error: "Slug board không được để trống" },
      { status: 400 },
    );
  }
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug)) {
    return Response.json(
      {
        error:
          "Slug chỉ gồm chữ thường, số và dấu gạch ngang (vd. nghiapd, team-a)",
      },
      { status: 400 },
    );
  }

  const existingSlug = await db.admin.findFirst({
    where: { slug, NOT: { id: adminId } },
  });
  if (existingSlug) {
    return Response.json(
      { error: "Slug này đã được admin khác sử dụng" },
      { status: 400 },
    );
  }

  try {
    await db.admin.update({
      where: { id: adminId },
      data: {
        displayName,
        slug,
        bankCode: bankCode || null,
        accountNumber: accountNumber || null,
        accountHolderName: accountHolderName || null,
      },
    });
    return Response.redirect(
      new URL("/profile?saved=1", request.url).toString(),
      302,
    );
  } catch (error) {
    console.error("Error updating admin profile:", error);
    return Response.json(
      { error: "Đã xảy ra lỗi khi lưu hồ sơ" },
      { status: 500 },
    );
  }
}

export default function Profile() {
  const { admin, boardUrl, bankConfigured, saved, passwordSaved } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const submittingIntent =
    navigation.formData?.get("intent")?.toString() ?? null;
  const isSavingProfile =
    isSubmitting && submittingIntent === "update-profile";
  const isChangingPassword =
    isSubmitting && submittingIntent === "change-password";

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Hồ sơ</h1>
      <p className="text-sm text-gray-600 mb-8">
        Tài khoản đăng nhập:{" "}
        <span className="font-medium">{admin.userName}</span>
      </p>

      {saved && (
        <div className="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded text-sm">
          Đã lưu hồ sơ.
        </div>
      )}

      {passwordSaved && (
        <div className="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded text-sm">
          Đã đổi mật khẩu.
        </div>
      )}

      {actionData &&
        typeof actionData === "object" &&
        "error" in actionData && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {String((actionData as { error: string }).error)}
          </div>
        )}

      {!bankConfigured && (
        <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded text-sm">
          Chưa cấu hình ngân hàng (hoặc thiếu trường) — mã QR thanh toán sẽ
          không hiển thị cho đến khi bạn điền đủ mã ngân hàng, số tài khoản và
          tên chủ tài khoản. Có thể để trống và cập nhật sau.
        </div>
      )}

      <Form
        method="post"
        className="space-y-8 bg-white border border-gray-200 rounded-lg p-6 shadow-sm"
      >
        <input type="hidden" name="intent" value="update-profile" />
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">
            Thông tin hiển thị
          </h2>
          <div>
            <label
              htmlFor="displayName"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Tên nhóm / board
            </label>
            <input
              type="text"
              id="displayName"
              name="displayName"
              defaultValue={admin.displayName ?? ""}
              className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-900"
              placeholder="An Trua Nao"
            />
          </div>

          <div>
            <label
              htmlFor="slug"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Slug (URL công khai) <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              id="slug"
              name="slug"
              required
              defaultValue={admin.slug}
              className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-900"
              placeholder="default"
            />
            <p className="text-xs text-gray-500 mt-1">
              Link board:{" "}
              <a
                href={boardUrl}
                className="text-blue-600 hover:underline break-all"
              >
                {boardUrl}
              </a>
            </p>
          </div>
        </section>

        <fieldset className="border-t border-gray-200 pt-6 space-y-4">
          <legend className="text-sm font-semibold text-gray-900">
            Ngân hàng (VietQR){" "}
            <span className="font-normal text-gray-500">— tùy chọn</span>
          </legend>
          <p className="text-xs text-gray-500 -mt-2">
            Để trống nếu chưa có tài khoản nhận tiền. Cần đủ 3 trường để hiện
            QR trên dashboard và trang đóng họ.
          </p>
          <div>
            <label
              htmlFor="bankCode"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Mã ngân hàng
            </label>
            <input
              type="text"
              id="bankCode"
              name="bankCode"
              defaultValue={admin.bankCode ?? ""}
              className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-900"
              placeholder="vpbank"
            />
          </div>
          <div>
            <label
              htmlFor="accountNumber"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Số tài khoản
            </label>
            <input
              type="text"
              id="accountNumber"
              name="accountNumber"
              defaultValue={admin.accountNumber ?? ""}
              className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-900"
              placeholder=""
            />
          </div>
          <div>
            <label
              htmlFor="accountHolderName"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Tên chủ tài khoản
            </label>
            <input
              type="text"
              id="accountHolderName"
              name="accountHolderName"
              defaultValue={admin.accountHolderName ?? ""}
              className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-900"
              placeholder=""
            />
          </div>
        </fieldset>

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-6">
          <a
            href={boardUrl}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Xem board
          </a>
          <button
            type="submit"
            disabled={isSavingProfile}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isSavingProfile ? "Đang lưu..." : "Lưu hồ sơ"}
          </button>
        </div>
      </Form>

      <Form
        method="post"
        className="mt-8 space-y-4 bg-white border border-gray-200 rounded-lg p-6 shadow-sm"
      >
        <input type="hidden" name="intent" value="change-password" />
        <h2 className="text-sm font-semibold text-gray-900">Đổi mật khẩu</h2>
        <p className="text-xs text-gray-500 -mt-2">
          Mật khẩu dùng để đăng nhập quản trị ({admin.userName}).
        </p>
        <div>
          <label
            htmlFor="currentPassword"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Mật khẩu hiện tại
          </label>
          <input
            type="password"
            id="currentPassword"
            name="currentPassword"
            required
            autoComplete="current-password"
            className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-900"
          />
        </div>
        <div>
          <label
            htmlFor="newPassword"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Mật khẩu mới
          </label>
          <input
            type="password"
            id="newPassword"
            name="newPassword"
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-900"
          />
        </div>
        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Xác nhận mật khẩu mới
          </label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-900"
          />
        </div>
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isChangingPassword}
            className="px-6 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 disabled:opacity-50"
          >
            {isChangingPassword ? "Đang đổi..." : "Đổi mật khẩu"}
          </button>
        </div>
      </Form>
    </div>
  );
}
