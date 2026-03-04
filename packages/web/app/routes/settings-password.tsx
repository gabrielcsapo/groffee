import { RequireAuth } from "../components/require-auth";
import SettingsPasswordClient from "./settings-password.client";

export default function SettingsPassword() {
  return (
    <RequireAuth returnPath="/settings/password">
      <SettingsPasswordClient />
    </RequireAuth>
  );
}
