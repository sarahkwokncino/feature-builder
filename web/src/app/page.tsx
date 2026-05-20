import { Topbar } from "@/components/topbar";
import { ProjectsList } from "@/components/projects-list";

export default function Home() {
  return (
    <>
      <Topbar title="Feature Heatmap" />
      <main className="flex-1 overflow-auto bg-[var(--color-gray-100,#f1f3f5)] p-8">
        <div className="mx-auto max-w-5xl">
          <ProjectsList />
        </div>
      </main>
    </>
  );
}
