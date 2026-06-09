import { Topbar } from "@/components/topbar";
import { PolicyExceptionsTool } from "@/components/policy-exceptions/policy-exceptions-tool";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default async function PolicyExceptionsPage(
  props: PageProps<"/projects/[projectId]/policy-exceptions">,
) {
  const { projectId } = await props.params;
  return (
    <>
      <Topbar
        title="Policy Exceptions Builder"
        back={{ href: `/projects/${projectId}`, label: "Heatmap" }}
        back2={{ href: `/projects/${projectId}/builders`, label: "Feature Builders" }}
      />
      <main className="flex-1 overflow-auto bg-slate-100">
        <PolicyExceptionsTool projectId={projectId as Id<"projects">} />
      </main>
    </>
  );
}
