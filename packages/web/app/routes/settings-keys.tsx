import SettingsKeysClient from "./settings-keys.client";
import { RequireAuth } from "../components/require-auth";

export default function SettingsKeys() {
  return (
    <RequireAuth returnPath="/settings/keys">
      <SettingsKeysClient />
    </RequireAuth>
  );
}
