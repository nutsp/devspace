/** Debounce writes and serialize them so an older response cannot mark newer edits saved. */
export function createTemplateAutosave<T, R>(options: {
  delay: number;
  persist: (value: T) => Promise<R>;
  status: (value: "pending" | "saving" | "saved" | "error", error?: unknown) => void;
  saved: (result: R) => void;
}) {
  let pending: { value: T } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let disposed = false;
  let failed = false;
  let revision = 0;
  async function flush() {
    if (disposed || running || !pending) return;
    clearTimeout(timer);
    timer = undefined;
    const current = pending;
    const currentRevision = revision;
    pending = undefined;
    running = true;
    failed = false;
    options.status("saving");
    try {
      const result = await options.persist(current.value);
      if (disposed) return;
      if (!pending && currentRevision === revision) {
        options.status("saved");
        options.saved(result);
      } else options.status("pending");
    } catch (error) {
      if (disposed) return;
      if (currentRevision === revision) pending ??= current;
      failed = true;
      options.status("error", error);
    } finally {
      running = false;
      if (!disposed && pending && !timer && !failed) void flush();
    }
  }
  return {
    schedule(value: T) {
      if (disposed) return;
      revision += 1;
      pending = { value };
      failed = false;
      options.status(running ? "saving" : "pending");
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void flush();
      }, options.delay);
    },
    pause() {
      revision += 1;
      clearTimeout(timer);
      timer = undefined;
      pending = undefined;
    },
    retry() {
      clearTimeout(timer);
      timer = undefined;
      void flush();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      pending = undefined;
    },
  };
}
