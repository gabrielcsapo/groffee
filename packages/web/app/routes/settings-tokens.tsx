import SettingsTokensClient from "./settings-tokens.client";
import { RequireAuth } from "../components/require-auth";

export default function SettingsTokens() {
  return (
    <RequireAuth returnPath="/settings/tokens">
      <SettingsTokensClient />
    </RequireAuth>
  );
}
