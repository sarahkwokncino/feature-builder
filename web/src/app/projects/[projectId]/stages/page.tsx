import { Topbar } from "@/components/topbar";
import { StagesTool } from "@/components/stages/stages-tool";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default async function StagesPage(
  props: PageProps<"/projects/[projectId]/stages">,
) {
  const { projectId } = await props.params;
  return (
    <>
      <Topbar
        title="Stages and UI Builder"
        back={{ href: `/projects/${projectId}`, label: "Heatmap" }}
        back2={{ href: `/projects/${projectId}/builders`, label: "Feature Builders" }}
      />
      <main className="flex-1 overflow-hidden bg-slate-100">
        <StagesTool projectId={projectId as Id<"projects">} />
      </main>
    </>
  );
}
