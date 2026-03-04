"use client";

import { useEffect } from "react";
import { useRouter } from "react-flight-router/client";

export default function SettingsRedirectClient() {
  const { navigate } = useRouter();

  useEffect(() => {
    navigate("/settings/profile");
  }, [navigate]);

  return null;
}
