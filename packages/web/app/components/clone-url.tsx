"use client";

import { useState, useEffect } from "react";

export function CloneUrl({ path }: { path: string }) {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = `${origin}${path}`;

  return <>{url}</>;
}
