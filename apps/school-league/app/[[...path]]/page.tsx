import { cookies } from "next/headers";
import { Dashboard } from "@startify/shared/ui";
import { service } from "../../lib";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<{ selection?: string }>;
}) {
  const { path = [] } = await params;
  const jar = await cookies();
  const query = await searchParams;
  return (
    <Dashboard
      initial={await service.view(
        "/" + path.join("/"),
        jar.get("demo-role-school-league")?.value,
        query.selection,
      )}
    />
  );
}
