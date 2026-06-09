import { Topbar } from "@/components/topbar";
import { ConnectionsTool } from "@/components/connections/connections-tool";
import type { Id } from "../../../../../../convex/_generated/dataModel";

export default async function ConnectionsPage(
  props: PageProps<"/projects/[projectId]/relationships/connections">,
) {
  const { projectId } = await props.params;
  return (
    <>
      <Topbar
        title="Connections Builder"
        back={{ href: `/projects/${projectId}/relationships`, label: "Relationships Suite" }}
        back2={{ href: `/projects/${projectId}/builders`, label: "Feature Builders" }}
      />
      <main className="flex-1 overflow-auto bg-slate-100">
        <ConnectionsTool projectId={projectId as Id<"projects">} />
      </main>
    </>
  );
}
