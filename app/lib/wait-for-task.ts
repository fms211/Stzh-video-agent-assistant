type ObservableTask = { status: string; error?: string | null };

export async function waitForTask<T extends ObservableTask>(
  fetchTask: () => Promise<T>,
  options: {
    onUpdate?: (task: T) => void;
    delay?: () => Promise<void>;
    timeoutMs?: number;
    now?: () => number;
  } = {},
): Promise<T> {
  const now = options.now || Date.now;
  const deadline = now() + (options.timeoutMs ?? 11 * 60 * 1000);
  const delay = options.delay || (() => new Promise<void>((resolve) => setTimeout(resolve, 1200)));
  let transientFailures = 0;
  while (now() < deadline) {
    let task: T;
    try {
      task = await fetchTask();
      transientFailures = 0;
    } catch (error) {
      if (++transientFailures >= 3) throw error;
      await delay();
      continue;
    }
    if (task.status === "completed") return task;
    if (task.status === "failed" || task.status === "cancelled") {
      throw new Error(task.error || (task.status === "cancelled" ? "任务已取消" : "任务执行失败"));
    }
    options.onUpdate?.(task);
    await delay();
  }
  throw new Error("任务仍在后台执行，可在任务中心继续查看进度");
}
