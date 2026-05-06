"use client";

import { Outlet, useLocation } from "react-flight-router/client";

export function KeyedOutlet() {
  const location = useLocation();
  return <Outlet key={location.pathname} />;
}
