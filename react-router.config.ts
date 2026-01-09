import type { Config } from "@react-router/dev/config";

export default {
  // Config options...
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,
  // Use file-based routing from app/routes directory
  routes: async (defineRoutes) => {
    return defineRoutes((route) => {
      // Routes are automatically discovered from app/routes/
      // File naming convention:
      // - routes/_index.tsx -> /
      // - routes/orders.new.tsx -> /orders/new
      // - routes/api.users.tsx -> /api/users
    });
  },
} satisfies Config;
