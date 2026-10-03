import type { Task, TaskStatus } from '@ai-office/contracts';

const TERMINAL: readonly TaskStatus[] = ['done', 'failed', 'cancelled'];

export function isTerminalStatus(status: TaskStatus): boolean {
  return TERMINAL.includes(status);
}

export function byId(tasks: readonly Task[]): Map<string, Task> {
  return new Map(tasks.map((task) => [task.id, task]));
}

/** Dependencies that are not `done` yet, in declaration order. */
export function computeBlockedBy(task: Task, index: ReadonlyMap<string, Task>): string[] {
  return task.dependsOn.filter((id) => index.get(id)?.status !== 'done');
}

export function isRunnable(task: Task, index: ReadonlyMap<string, Task>): boolean {
  return !isTerminalStatus(task.status) && computeBlockedBy(task, index).length === 0;
}

/** Queue order: position first, creation time as a stable tie-break. */
export function orderQueue(tasks: readonly Task[]): Task[] {
  return [...tasks].sort(
    (a, b) => a.queuePosition - b.queuePosition || a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * The next task for an agent: earliest runnable task in queue order. `index`
 * must contain ALL tasks (not just the agent's) so cross-agent dependencies are
 * resolved. A task that is `running` is never returned (one run per agent).
 */
export function nextRunnableTask(allTasks: readonly Task[], agentId?: string): Task | null {
  const index = byId(allTasks);
  const candidates = orderQueue(allTasks).filter(
    (task) =>
      (agentId === undefined || task.agentId === agentId) &&
      task.status !== 'running' &&
      isRunnable(task, index),
  );
  return candidates[0] ?? null;
}

/**
 * True when setting `taskId`'s dependencies to `dependsOn` would create a cycle.
 * Existing edges for `taskId` are ignored, since this call describes its new set.
 */
export function wouldCreateCycle(
  tasks: readonly Task[],
  taskId: string,
  dependsOn: readonly string[],
): boolean {
  if (dependsOn.includes(taskId)) return true;

  const edges = new Map<string, readonly string[]>();
  for (const task of tasks) edges.set(task.id, task.id === taskId ? [] : task.dependsOn);

  const seen = new Set<string>();
  const stack = [...dependsOn];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    if (current === taskId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of edges.get(current) ?? []) stack.push(next);
  }
  return false;
}

/**
 * Re-derives `blocked` vs `queued` for every task that is neither terminal nor
 * running. A failed dependency keeps dependents blocked (not failed), so fixing
 * and re-running the dependency unblocks them.
 */
export function recomputeBlocked(tasks: readonly Task[]): Task[] {
  const index = byId(tasks);
  return tasks.map((task) => {
    if (isTerminalStatus(task.status) || task.status === 'running') return task;
    const blockedBy = computeBlockedBy(task, index);
    const status: TaskStatus = blockedBy.length > 0 ? 'blocked' : 'queued';
    if (task.status === status && sameIds(task.blockedBy, blockedBy)) return task;
    return { ...task, status, blockedBy };
  });
}

export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** Task ids that are waiting on (directly or transitively) a failed dependency. */
export function blockedByFailure(tasks: readonly Task[]): Set<string> {
  const index = byId(tasks);
  const broken = new Set<string>();
  const stack = tasks
    .filter((task) => task.status === 'failed' || task.status === 'cancelled')
    .map((task) => task.id);
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined) break;
    for (const task of tasks) {
      if (!task.dependsOn.includes(id)) continue;
      if (broken.has(task.id)) continue;
      broken.add(task.id);
      stack.push(task.id);
    }
  }
  for (const id of broken) {
    const task = index.get(id);
    if (task !== undefined && isTerminalStatus(task.status)) broken.delete(id);
  }
  return broken;
}
