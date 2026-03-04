"use client";

import { BranchSwitcher } from "@groffee/ui";
import { useRouter } from "react-flight-router/client";

interface BranchSwitcherWrapperProps {
  branches: { name: string }[];
  currentRef: string;
  basePath: string;
}

export function BranchSwitcherWrapper({ branches, currentRef, basePath }: BranchSwitcherWrapperProps) {
  const { navigate } = useRouter();
  return (
    <BranchSwitcher
      branches={branches}
      currentRef={currentRef}
      onBranchChange={(branch) => navigate(`${basePath}/tree/${encodeURIComponent(branch)}`)}
    />
  );
}
