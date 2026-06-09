import { Topbar } from "@/components/topbar";
import { ConditionsTool } from "@/components/conditions/conditions-tool";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default async function ConditionsPage(
  props: PageProps<"/projects/[projectId]/conditions">,
) {
  const { projectId } = await props.params;
  return (
    <>
      <Topbar
        title="Conditions Builder"
        back={{ href: `/projects/${projectId}`, label: "Heatmap" }}
        back2={{ href: `/projects/${projectId}/builders`, label: "Feature Builders" }}
      />
      <main className="flex-1 overflow-auto bg-slate-100">
        <ConditionsTool projectId={projectId as Id<"projects">} />
      </main>
    </>
  );
}
