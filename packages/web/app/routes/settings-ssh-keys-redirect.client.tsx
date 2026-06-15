"use client";

import { useEffect } from "react";
import { useRouter } from "react-flight-router/client";

export default function SettingsSshKeysRedirect() {
  const { navigate } = useRouter();

  useEffect(() => {
    navigate("/settings/keys");
  }, [navigate]);

  return null;
}
