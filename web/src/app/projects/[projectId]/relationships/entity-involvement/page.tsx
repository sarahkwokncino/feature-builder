import { Topbar } from "@/components/topbar";
import { EntityInvolvementTool } from "@/components/entity-involvement/entity-involvement-tool";
import type { Id } from "../../../../../../convex/_generated/dataModel";

export default async function EntityInvolvementPage(
  props: PageProps<"/projects/[projectId]/relationships/entity-involvement">,
) {
  const { projectId } = await props.params;
  return (
    <>
      <Topbar
        title="Entity Involvement Type Builder"
        back={{ href: `/projects/${projectId}/relationships`, label: "Relationships Suite" }}
        back2={{ href: `/projects/${projectId}/builders`, label: "Feature Builders" }}
      />
      <main className="flex-1 overflow-auto bg-slate-100">
        <EntityInvolvementTool projectId={projectId as Id<"projects">} />
      </main>
    </>
  );
}
