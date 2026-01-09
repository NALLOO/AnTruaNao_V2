import type { Route } from "./+types/login";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { db } from "~/lib/db.server";
import { createAdminSession, getAdminId } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Đăng nhập - An Trua Nao" },
    { name: "description", content: "Đăng nhập để quản lý hệ thống" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Nếu đã đăng nhập, redirect về dashboard
  const adminId = await getAdminId(request);
  if (adminId) {
    return Response.redirect(new URL("/", request.url).toString(), 302);
  }
  return {};
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const userName = formData.get("userName") as string;
  const password = formData.get("password") as string;

  if (!userName || !password) {
    return Response.json(
      { error: "Vui lòng nhập đầy đủ thông tin" },
      { status: 400 }
    );
  }

  try {
    // Tìm admin trong database
    const admin = await db.admin.findUnique({
      where: {
        userName: userName.trim(),
      },
    });

    if (!admin || admin.password !== password) {
      return Response.json(
        { error: "Tên đăng nhập hoặc mật khẩu không đúng" },
        { status: 401 }
      );
    }

    // Tạo session và redirect
    return createAdminSession(admin.id, "/", request);
  } catch (error) {
    console.error("Error during login:", error);
    return Response.json(
      { error: "Đã xảy ra lỗi khi đăng nhập" },
      { status: 500 }
    );
  }
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="text-center text-3xl font-bold text-gray-900">
            🍜 An Trua Nao
          </h1>
          <h2 className="mt-6 text-center text-2xl font-semibold text-gray-900">
            Đăng nhập
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Vui lòng đăng nhập để quản lý hệ thống
          </p>
        </div>
        <Form method="post" className="mt-8 space-y-6">
          {actionData &&
            typeof actionData === "object" &&
            "error" in actionData && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {String((actionData as { error: string }).error)}
              </div>
            )}

          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="userName" className="sr-only">
                Tên đăng nhập
              </label>
              <input
                id="userName"
                name="userName"
                type="text"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Tên đăng nhập"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Mật khẩu
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Mật khẩu"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}

