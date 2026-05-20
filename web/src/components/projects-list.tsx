"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export function ProjectsList() {
  const projects = useQuery(api.projects.list);
  const createProject = useMutation(api.projects.create);
  const renameProject = useMutation(api.projects.rename);
  const removeProject = useMutation(api.projects.remove);
  const router = useRouter();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [customer, setCustomer] = useState("");
  const [region, setRegion] = useState("");

  const [renameTarget, setRenameTarget] = useState<{
    id: Id<"projects">;
    name: string;
  } | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    const id = await createProject({
      name: name.trim(),
      customer: customer.trim() || undefined,
      region: region.trim() || undefined,
    });
    setCreateOpen(false);
    setName("");
    setCustomer("");
    setRegion("");
    toast.success("Project created");
    router.push(`/projects/${id}`);
  }

  async function handleRename() {
    if (!renameTarget) return;
    await renameProject({ id: renameTarget.id, name: renameTarget.name });
    setRenameTarget(null);
    toast.success("Project renamed");
  }

  async function handleDelete(id: Id<"projects">, name: string) {
    if (!confirm(`Delete "${name}" and all its heatmap data?`)) return;
    await removeProject({ id });
    toast.success("Project deleted");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Projects</h2>
          <p className="text-sm text-slate-600">
            Each project is a customer implementation with its own editable
            heatmap.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger
            render={
              <Button className="bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]" />
            }
          >
            + New project
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New project</DialogTitle>
              <DialogDescription>
                Creates a heatmap seeded from the canonical PHASES template.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Bank — Q3 implementation"
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="customer">Customer (optional)</Label>
                <Input
                  id="customer"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="Acme Bank"
                />
              </div>
              <div>
                <Label htmlFor="region">Region (optional)</Label>
                <Input
                  id="region"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="ECB / USB / APAC"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {projects === undefined ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-slate-600">
            No projects yet. Create your first one.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li
              key={p._id}
              className="group relative rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[var(--color-blue)] hover:shadow-md"
            >
              <button
                className="block w-full text-left"
                onClick={() => router.push(`/projects/${p._id}`)}
              >
                <div className="font-semibold text-slate-900">{p.name}</div>
                {p.customer ? (
                  <div className="mt-0.5 text-xs text-slate-500">
                    {p.customer}
                    {p.region ? ` · ${p.region}` : ""}
                  </div>
                ) : null}
                <div className="mt-3 text-[11px] uppercase tracking-wide text-slate-400">
                  Created {new Date(p.createdAt).toLocaleDateString()}
                </div>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="absolute right-3 top-3 rounded p-1 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Project actions"
                >
                  ⋯
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      setRenameTarget({ id: p._id, name: p.name })
                    }
                  >
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={() => handleDelete(p._id, p.name)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={!!renameTarget}
        onOpenChange={(o) => !o && setRenameTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <Input
            value={renameTarget?.name ?? ""}
            onChange={(e) =>
              setRenameTarget((t) =>
                t ? { ...t, name: e.target.value } : null,
              )
            }
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
