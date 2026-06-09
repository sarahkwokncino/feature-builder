import { Topbar } from "@/components/topbar";
import { FeesTool } from "@/components/fees/fees-tool";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default async function FeesPage(
  props: PageProps<"/projects/[projectId]/fees">,
) {
  const { projectId } = await props.params;
  return (
    <>
      <Topbar
        title="Fees Builder"
        back={{ href: `/projects/${projectId}`, label: "Heatmap" }}
        back2={{ href: `/projects/${projectId}/builders`, label: "Feature Builders" }}
      />
      <main className="flex-1 overflow-hidden bg-slate-100">
        <FeesTool projectId={projectId as Id<"projects">} />
      </main>
    </>
  );
}
