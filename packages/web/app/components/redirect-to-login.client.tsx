"use client";

import { useEffect } from "react";

export function RedirectToLogin({ returnPath }: { returnPath: string }) {
  useEffect(() => {
    window.location.href = `/login?return=${encodeURIComponent(returnPath)}`;
  }, [returnPath]);

  return (
    <div className="max-w-sm mx-auto mt-16 text-center">
      <p className="text-text-secondary">Redirecting to login...</p>
    </div>
  );
}
