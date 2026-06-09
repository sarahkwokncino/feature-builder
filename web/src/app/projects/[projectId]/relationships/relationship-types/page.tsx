import { Topbar } from "@/components/topbar";
import { RelationshipsTool } from "@/components/relationships/relationships-tool";
import type { Id } from "../../../../../../convex/_generated/dataModel";

export default async function RelationshipTypesPage(
  props: PageProps<"/projects/[projectId]/relationships/relationship-types">,
) {
  const { projectId } = await props.params;
  return (
    <>
      <Topbar
        title="Relationship Type Builder"
        back={{ href: `/projects/${projectId}/relationships`, label: "Relationships Suite" }}
        back2={{ href: `/projects/${projectId}/builders`, label: "Feature Builders" }}
      />
      <main className="flex-1 overflow-auto bg-slate-100">
        <RelationshipsTool projectId={projectId as Id<"projects">} />
      </main>
    </>
  );
}
