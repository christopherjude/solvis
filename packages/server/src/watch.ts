import { watch, type FSWatcher } from 'node:fs';
import { isTemplatePath } from './discover.js';

/**
 * Watch a project directory (recursively) for template changes and invoke `onChange`
 * after a debounce window. Best-effort: if the platform can't do a recursive watch,
 * watching simply does nothing and the UI falls back to manual re-scan.
 */
export class ProjectWatcher {
  private watcher: FSWatcher | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly dir: string,
    private readonly onChange: () => void,
    private readonly debounceMs = 300,
  ) {}

  start(): void {
    if (this.watcher) return;
    try {
      this.watcher = watch(this.dir, { recursive: true }, (_event, filename) => {
        if (filename && !isTemplatePath(filename.toString())) return;
        this.schedule();
      });
    } catch {
      // Recursive watch unsupported here — leave unwatched; manual re-scan still works.
      this.watcher = undefined;
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.onChange(), this.debounceMs);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.watcher?.close();
    this.watcher = undefined;
  }
}
