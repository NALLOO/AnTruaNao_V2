import type { Route } from "./+types/settings";

/** Giữ URL cũ — chuyển sang trang hồ sơ */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const target = new URL("/profile", url.origin);
  url.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  return Response.redirect(target.toString(), 302);
}

export default function SettingsRedirect() {
  return null;
}
