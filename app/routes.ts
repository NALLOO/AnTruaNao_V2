// React Router v7 route configuration
// Routes are defined using file-based routing convention
// File naming: orders.new.tsx maps to /orders/new

import type { RouteConfig } from "@react-router/dev/routes";

export default [
  {
    index: true,
    file: "routes/_index.tsx",
  },
  {
    path: "login",
    file: "routes/login.tsx",
  },
  {
    path: "logout",
    file: "routes/logout.tsx",
  },
  {
    path: "orders/new",
    file: "routes/orders.new.tsx",
  },
  {
    path: "orders/:id/edit",
    file: "routes/orders.$id.edit.tsx",
  },
  {
    path: "members",
    file: "routes/members.tsx",
  },
  {
    path: "payment",
    file: "routes/payment.tsx",
  },
  {
    path: "weeks",
    file: "routes/weeks.tsx",
  },
  {
    path: "api/users",
    file: "routes/api.users.tsx",
  },
  {
    path: "*",
    file: "routes/$.tsx",
  },
] satisfies RouteConfig;

