"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function useBuilderLock(projectId: Id<"projects">, kind: string) {
  const lockedKinds = useQuery(api.builderLocks.listForProject, { projectId });
  const lockMutation = useMutation(api.builderLocks.lock);
  const unlockMutation = useMutation(api.builderLocks.unlock);

  const isLocked = lockedKinds !== undefined && lockedKinds.includes(kind);

  async function toggleLock() {
    if (isLocked) {
      await unlockMutation({ projectId, kind });
    } else {
      await lockMutation({ projectId, kind });
    }
  }

  return { isLocked, toggleLock, isLoading: lockedKinds === undefined };
}
