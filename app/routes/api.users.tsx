import type { Route } from "./+types/api.users";
import { db } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  const users = await db.user.findMany({
    orderBy: {
      name: "asc",
    },
  });

  return users;
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const { name } = body;

  if (!name || !name.trim()) {
    return Response.json({ error: "Tên không được để trống" }, { status: 400 });
  }

  // Tìm user đã tồn tại hoặc tạo mới
  let user = await db.user.findFirst({
    where: {
      name: name.trim(),
    },
  });

  if (!user) {
    user = await db.user.create({
      data: {
        name: name.trim(),
      },
    });
  }

  return user;
}

