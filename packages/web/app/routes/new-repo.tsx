import NewRepoClient from "./new-repo.client";
import { RequireAuth } from "../components/require-auth";

export default function NewRepo() {
  return (
    <RequireAuth returnPath="/new">
      <NewRepoClient />
    </RequireAuth>
  );
}
