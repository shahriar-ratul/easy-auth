import { Panel } from "@/components/panel";

/**
 * Everything on this page reads live state, so nothing here is prerendered —
 * the panel fetches its own data from the route handlers once it mounts.
 */
export const dynamic = "force-dynamic";

export default function Page() {
  return <Panel />;
}
