"use client";

import { RepoNav } from "@groffee/ui";
import { Link, useLocation } from "react-flight-router/client";

interface RepoNavWrapperProps {
  owner: string;
  repo: string;
  openIssueCount?: number;
  openPrCount?: number;
  isOwner?: boolean;
  latestRunStatus?: string | null;
}

export function RepoNavWrapper(props: RepoNavWrapperProps) {
  const location = useLocation();
  return <RepoNav {...props} linkComponent={Link} currentPath={location.pathname} />;
}
