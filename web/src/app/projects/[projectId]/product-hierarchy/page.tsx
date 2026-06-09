import { Topbar } from "@/components/topbar";
import { ProductHierarchyTool } from "@/components/product-hierarchy/product-hierarchy-tool";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default async function ProductHierarchyPage(
  props: PageProps<"/projects/[projectId]/product-hierarchy">,
) {
  const { projectId } = await props.params;
  return (
    <>
      <Topbar
        title="Product Hierarchy Builder"
        back={{ href: `/projects/${projectId}`, label: "Heatmap" }}
        back2={{ href: `/projects/${projectId}/builders`, label: "Feature Builders" }}
      />
      <main className="flex-1 overflow-auto bg-slate-100">
        <ProductHierarchyTool projectId={projectId as Id<"projects">} />
      </main>
    </>
  );
}
