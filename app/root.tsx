import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLoaderData,
} from "react-router";
import type { Route } from "./+types/root";
import appStyles from "./app.css?url";
import { boardUrlForAdmin } from "~/lib/admin.shared";

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: appStyles },
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  const { getAdminId } = await import("~/lib/session.server");
  const { getAdminById } = await import("~/lib/admin.server");
  const adminId = await getAdminId(request);
  let dashboardHref = "/";
  if (adminId) {
    const admin = await getAdminById(adminId);
    if (admin) {
      dashboardHref = boardUrlForAdmin(admin.slug);
    }
  }
  return { isAuthenticated: !!adminId, dashboardHref };
}

export default function App() {
  const { isAuthenticated, dashboardHref } = useLoaderData<typeof loader>();

  return (
    <html lang="vi">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <div className="min-h-screen bg-gray-50">
          <nav className="bg-white shadow-sm border-b">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16">
                <div className="flex items-center">
                  <a href={dashboardHref} className="text-xl font-bold text-gray-900">
                    🍜 An Trua Nao
                  </a>
                </div>
                <div className="flex items-center space-x-4">
                  <a
                    href={dashboardHref}
                    className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    Dashboard
                  </a>
                  {isAuthenticated ? (
                    <>
                      <a
                        href="/profile"
                        className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                      >
                        Hồ sơ
                      </a>
                      <a
                        href="/weeks"
                        className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                      >
                        Tuần
                      </a>
                      <a
                        href="/orders/new"
                        className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                      >
                        Thêm đơn hàng
                      </a>
                      <a
                        href="/members"
                        className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                      >
                        Thành viên
                      </a>
                      <a
                        href="/logout"
                        className="text-red-600 hover:text-red-800 px-3 py-2 rounded-md text-sm font-medium"
                      >
                        Đăng xuất
                      </a>
                    </>
                  ) : (
                    <a
                      href="/login"
                      className="text-blue-600 hover:text-blue-800 px-3 py-2 rounded-md text-sm font-medium"
                    >
                      Đăng nhập
                    </a>
                  )}
                </div>
              </div>
            </div>
          </nav>
          <main>
            <Outlet />
          </main>
        </div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Đã xảy ra lỗi";
  let details = "Vui lòng thử lại sau hoặc liên hệ quản trị viên.";

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Lỗi";
    details =
      error.status === 404
        ? "Trang không tồn tại."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
  }

  return (
    <html lang="vi">
      <head>
        <title>Lỗi</title>
        <Meta />
        <Links />
      </head>
      <body>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              {message}
            </h1>
            <p className="text-gray-600">{details}</p>
          </div>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
