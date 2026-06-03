import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { HeatmapBoard } from "@/components/heatmap/heatmap-board";
import { Id } from "../../../../convex/_generated/dataModel";

export default async function ProjectPage(
  props: PageProps<"/projects/[projectId]">,
) {
  const { projectId } = await props.params;
  return (
    <>
      <Topbar
        title="Feature Heatmap"
        back={{ href: "/", label: "Projects" }}
        right={
          <Link
            href={`/projects/${projectId}/builders`}
            className="rounded border border-white/25 bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
          >
            Feature Builders →
          </Link>
        }
      />
      <main className="flex-1 overflow-auto bg-slate-100">
        <HeatmapBoard projectId={projectId as Id<"projects">} />
      </main>
    </>
  );
}
