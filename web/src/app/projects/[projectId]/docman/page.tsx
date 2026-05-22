import { Topbar } from "@/components/topbar";
import { DocmanTool } from "@/components/docman/docman-tool";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default async function DocmanPage(
  props: PageProps<"/projects/[projectId]/docman">,
) {
  const { projectId } = await props.params;
  const search = await props.searchParams;
  const cardId = typeof search.cardId === "string" ? search.cardId : undefined;
  return (
    <>
      <Topbar
        title="Document Manager Builder"
        back={{ href: `/projects/${projectId}`, label: "Heatmap" }}
      />
      <main className="flex-1 overflow-auto bg-slate-100">
        <DocmanTool
          projectId={projectId as Id<"projects">}
          cardId={cardId as Id<"cards"> | undefined}
        />
      </main>
    </>
  );
}
