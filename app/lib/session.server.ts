// Simple cookie-based session management
const SESSION_COOKIE_NAME = "__admin_session";
const SESSION_SECRET = process.env.SESSION_SECRET || "antruanao-secret-key-change-in-production";

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const cookie = cookies.find((c) => c.startsWith(`${name}=`));
  if (!cookie) return null;
  return cookie.substring(name.length + 1);
}

function setCookie(name: string, value: string, maxAge: number = 60 * 60 * 24 * 7): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

function deleteCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function getAdminId(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get("Cookie");
  const sessionId = getCookieValue(cookieHeader, SESSION_COOKIE_NAME);
  if (!sessionId) return null;
  
  // Simple validation - in production, you should verify the session is valid
  // For now, we'll just check if it exists and matches a pattern
  try {
    // Decode simple session (in production, use proper encryption)
    const decoded = decodeURIComponent(sessionId);
    return decoded || null;
  } catch {
    return null;
  }
}

export async function createAdminSession(adminId: string, redirectTo: string, request?: Request): Promise<Response> {
  // Simple session encoding (in production, use proper encryption)
  const sessionValue = encodeURIComponent(adminId);
  const cookie = setCookie(SESSION_COOKIE_NAME, sessionValue);
  
  // Tạo URL đầy đủ từ redirectTo
  let redirectUrl: string;
  if (request) {
    const url = new URL(request.url);
    redirectUrl = new URL(redirectTo, url.origin).toString();
  } else {
    // Fallback: nếu không có request, dùng redirectTo trực tiếp (phải là URL đầy đủ)
    redirectUrl = redirectTo.startsWith("http") ? redirectTo : `http://localhost:3000${redirectTo}`;
  }
  
  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectUrl,
      "Set-Cookie": cookie,
    },
  });
}

export async function logout(request: Request): Promise<Response> {
  const cookie = deleteCookie(SESSION_COOKIE_NAME);
  const url = new URL(request.url);
  const loginUrl = new URL("/login", url.origin).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: loginUrl,
      "Set-Cookie": cookie,
    },
  });
}

export async function requireAdminId(request: Request): Promise<string> {
  const adminId = await getAdminId(request);
  if (!adminId) {
    const url = new URL(request.url);
    const loginUrl = new URL("/login", url.origin).toString();
    throw new Response(null, {
      status: 302,
      headers: {
        Location: loginUrl,
      },
    });
  }
  return adminId;
}

