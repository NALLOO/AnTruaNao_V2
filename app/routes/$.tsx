import type { Route } from "./+types/$";

// Catch-all route để xử lý các route không khớp
// Đặc biệt là các request từ Chrome DevTools như /.well-known/*
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  
  // Bỏ qua các request từ Chrome DevTools và các well-known paths
  if (url.pathname.startsWith("/.well-known/")) {
    return Response.json({}, { status: 404 });
  }
  
  // Trả về 404 cho các route không tồn tại
  throw Response.json(
    { error: "Route not found" },
    { status: 404 }
  );
}

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
        <p className="text-gray-600 mb-4">Trang không tồn tại</p>
        <a
          href="/"
          className="text-blue-600 hover:text-blue-800 underline"
        >
          Về trang chủ
        </a>
      </div>
    </div>
  );
}

