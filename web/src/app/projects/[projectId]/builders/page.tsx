import { Topbar } from "@/components/topbar";
import { BuildersHub } from "@/components/heatmap/builders-hub";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default async function BuildersPage(
  props: PageProps<"/projects/[projectId]/builders">,
) {
  const { projectId } = await props.params;
  return (
    <>
      <Topbar
        title="Feature Builders"
        back={{ href: `/projects/${projectId}`, label: "Heatmap" }}
      />
      <main className="flex-1 overflow-auto bg-slate-100">
        <BuildersHub projectId={projectId as Id<"projects">} />
      </main>
    </>
  );
}
