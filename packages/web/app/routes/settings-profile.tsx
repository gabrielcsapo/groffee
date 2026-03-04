import { RequireAuth } from "../components/require-auth";
import SettingsProfileClient from "./settings-profile.client";

export default function SettingsProfile() {
  return (
    <RequireAuth returnPath="/settings/profile">
      <SettingsProfileClient />
    </RequireAuth>
  );
}
