import { fetchServer } from "../react-router-vite/entry.rsc";
import { requestStorage } from "./lib/server/request-context";

export default async function handler(request: Request) {
  return requestStorage.run(request, async () => {
    const ssr = await (import.meta as any).viteRsc.loadModule("ssr", "index") as typeof import("../react-router-vite/entry.ssr");
    return ssr.default(request, await fetchServer(request));
  });
}
