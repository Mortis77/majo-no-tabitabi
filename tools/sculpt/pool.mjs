// Worker pool: every worker imports the asset module and rebuilds the same field (closures cannot cross threads), then
// runs tasks from tools/sculpt/worker.mjs on chunks. Default size = cores - 4 (two cores stay free for other jobs + main).
import os from 'node:os';
import { Worker } from 'node:worker_threads';

export class Pool {
  constructor(assetPath, opts = {}) {
    const n = opts.threads || Number(process.env.SCULPT_THREADS) || Math.max(1, Math.min(6, os.cpus().length - 4)); // SCULPT_THREADS=2 when several sculptors share the machine
    this.workers = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { assetPath, opts: opts.workerOpts || {} } });
      w.unref();
      this.workers.push({ w, busy: false });
    }
    this.queue = [];
    this.size = n;
  }
  run(task, data, transfer = []) {
    return new Promise((resolve, reject) => { this.queue.push({ task, data, transfer, resolve, reject }); this._pump(); });
  }
  _pump() {
    for (const s of this.workers) {
      if (s.busy || !this.queue.length) continue;
      const job = this.queue.shift();
      s.busy = true;
      const done = (m) => { s.w.off('message', done); s.w.off('error', fail); s.busy = false; if (m && m.error) job.reject(new Error(m.error)); else job.resolve(m); this._pump(); };
      const fail = (e) => { s.w.off('message', done); s.w.off('error', fail); s.busy = false; job.reject(e); this._pump(); };
      s.w.on('message', done); s.w.on('error', fail);
      s.w.postMessage({ task: job.task, data: job.data }, job.transfer);
    }
  }
  /** run `task` over chunks in parallel, results in order */
  map(task, chunks) { return Promise.all(chunks.map((c) => this.run(task, c))); }
  async close() { await Promise.all(this.workers.map((s) => s.w.terminate())); }
}
