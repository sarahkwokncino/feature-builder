import { Topbar } from "@/components/topbar";
import { CollateralTool } from "@/components/collateral/collateral-tool";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default async function CollateralPage(
  props: PageProps<"/projects/[projectId]/collateral">,
) {
  const { projectId } = await props.params;
  return (
    <>
      <Topbar
        title="Collateral Management Builder"
        back={{ href: `/projects/${projectId}`, label: "Heatmap" }}
      />
      <main className="flex-1 overflow-auto bg-slate-100">
        <CollateralTool
          projectId={projectId as Id<"projects">}
        />
      </main>
    </>
  );
}
