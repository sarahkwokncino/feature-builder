import { Topbar } from "@/components/topbar";
import { ChecklistTool } from "@/components/checklist/checklist-tool";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default async function ChecklistPage(
  props: PageProps<"/projects/[projectId]/checklist">,
) {
  const { projectId } = await props.params;
  const search = await props.searchParams;
  const cardId = typeof search.cardId === "string" ? search.cardId : undefined;
  return (
    <>
      <Topbar
        title="Smart Checklist Builder"
        back={{ href: `/projects/${projectId}`, label: "Heatmap" }}
      />
      <main className="flex-1 overflow-auto bg-slate-100">
        <ChecklistTool
          projectId={projectId as Id<"projects">}
          cardId={cardId as Id<"cards"> | undefined}
        />
      </main>
    </>
  );
}
