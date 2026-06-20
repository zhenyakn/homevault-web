/**
 * Rotating, optionally-gzip-compressed local log file sink.
 *
 * Why in-house rather than a dependency (pino-roll etc.): zero new packages
 * keeps the production bundle lean and the locked-down add-on container able to
 * build, and the rotation/retention rules are simple enough to own and unit
 * test directly.
 *
 * Behaviour:
 *  - Appends NDJSON lines to `<dir>/<base>.log`.
 *  - When the active file passes `maxSizeBytes`, rotates: `<base>.log` →
 *    `<base>.log.1` (gzipped to `.1.gz` when `compress`), shifting older files
 *    up and discarding anything past `maxFiles`.
 *  - Retention: also drops rotated files older than `retentionDays`.
 *
 * Writes are serialized through an async queue so a rotation can never
 * interleave with an append, and pino's synchronous `write()` never blocks on
 * disk — it just enqueues.
 */

import { promises as fs, createReadStream, createWriteStream } from "fs";
import { existsSync, statSync, readdirSync } from "fs";
import path from "path";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";

export interface FileSinkOptions {
  dir: string;
  baseName?: string; // default "homevault"
  maxSizeBytes: number;
  maxFiles: number; // number of rotated files to retain (excludes active)
  retentionDays?: number; // 0 = age-based retention disabled
  compress?: boolean;
}

export class RotatingFileSink {
  readonly dir: string;
  readonly baseName: string;
  readonly activePath: string;
  private readonly maxSizeBytes: number;
  private readonly maxFiles: number;
  private readonly retentionMs: number;
  private readonly compress: boolean;

  private bytes = 0;
  private queue: string[] = [];
  private chain: Promise<void> = Promise.resolve();
  private closed = false;
  private ready: Promise<void>;

  constructor(opts: FileSinkOptions) {
    this.dir = opts.dir;
    this.baseName = opts.baseName ?? "homevault";
    this.activePath = path.join(this.dir, `${this.baseName}.log`);
    this.maxSizeBytes = Math.max(1, opts.maxSizeBytes);
    this.maxFiles = Math.max(1, opts.maxFiles);
    this.retentionMs = (opts.retentionDays ?? 0) * 24 * 60 * 60 * 1000;
    this.compress = opts.compress ?? true;
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    try {
      this.bytes = (await fs.stat(this.activePath)).size;
    } catch {
      this.bytes = 0;
    }
  }

  /** pino-multistream entry point. Non-blocking: enqueues and returns true. */
  write(line: string): boolean {
    if (this.closed) return false;
    this.queue.push(line.endsWith("\n") ? line : line + "\n");
    this.kick();
    return true;
  }

  private kick(): void {
    this.chain = this.chain.then(() => this.drain()).catch(() => {});
  }

  private async drain(): Promise<void> {
    await this.ready;
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length).join("");
    await fs.appendFile(this.activePath, batch);
    this.bytes += Buffer.byteLength(batch);
    if (this.bytes >= this.maxSizeBytes) {
      await this.rotate();
    }
  }

  /** Rotate the active file, shift the history, compress + prune. */
  async rotate(): Promise<void> {
    if (!existsSync(this.activePath)) {
      this.bytes = 0;
      return;
    }
    // Shift existing rotated files: .N → .N+1 (newest is .1), dropping overflow.
    for (let i = this.maxFiles; i >= 1; i--) {
      const from = this.rotatedPath(i);
      const to = this.rotatedPath(i + 1);
      if (existsSync(from)) {
        if (i >= this.maxFiles) {
          await safeUnlink(from); // beyond retention window
        } else {
          await fs.rename(from, to);
        }
      }
    }
    // Move the active file into slot .1, compressing if enabled.
    const target = this.rotatedPath(1);
    if (this.compress) {
      await gzipFile(this.activePath, target);
      await safeUnlink(this.activePath);
    } else {
      await fs.rename(this.activePath, target);
    }
    this.bytes = 0;
    await this.pruneByAge();
  }

  private rotatedPath(n: number): string {
    const ext = this.compress ? ".gz" : "";
    return path.join(this.dir, `${this.baseName}.log.${n}${ext}`);
  }

  /** Delete rotated files older than the retention window. */
  async pruneByAge(): Promise<void> {
    if (this.retentionMs <= 0) return;
    const cutoff = Date.now() - this.retentionMs;
    for (const f of await this.listRotated()) {
      try {
        const st = await fs.stat(f);
        if (st.mtimeMs < cutoff) await safeUnlink(f);
      } catch {
        /* file vanished — fine */
      }
    }
  }

  private async listRotated(): Promise<string[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.dir);
    } catch {
      return [];
    }
    const rx = new RegExp(`^${escapeRx(this.baseName)}\\.log\\.\\d+(\\.gz)?$`);
    return names.filter(n => rx.test(n)).map(n => path.join(this.dir, n));
  }

  /** Flush all queued writes to disk. */
  async flush(): Promise<void> {
    this.kick();
    await this.chain;
  }

  async close(): Promise<void> {
    await this.flush();
    this.closed = true;
  }
}

/** Metadata for the viewer's "download log file" list. */
export interface LogFileInfo {
  name: string;
  bytes: number;
  modifiedAt: number;
  compressed: boolean;
}

export function listLogFiles(
  dir: string,
  baseName = "homevault"
): LogFileInfo[] {
  if (!existsSync(dir)) return [];
  const rx = new RegExp(`^${escapeRx(baseName)}\\.log(\\.\\d+)?(\\.gz)?$`);
  const out: LogFileInfo[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of names) {
    if (!rx.test(name)) continue;
    try {
      const st = statSync(path.join(dir, name));
      out.push({
        name,
        bytes: st.size,
        modifiedAt: st.mtimeMs,
        compressed: name.endsWith(".gz"),
      });
    } catch {
      /* skip */
    }
  }
  // Active file first, then newest rotations.
  return out.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

async function gzipFile(src: string, dest: string): Promise<void> {
  await pipeline(createReadStream(src), createGzip(), createWriteStream(dest));
}

async function safeUnlink(p: string): Promise<void> {
  try {
    await fs.unlink(p);
  } catch {
    /* already gone */
  }
}

function escapeRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
