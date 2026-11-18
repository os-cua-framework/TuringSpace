// Loads one task instance from the URL (?task=&seed=&cue=), draws it, and judges the first press of Verify.
// window.TuringSpace.getResult() returns that verdict for the harness.

import { mulberry32, R, taskSeed } from './rng.js';
import { loadAssetIndex, loadFonts } from './assets.js';
import { Panel } from './panel.js';
import { REGISTRY } from './registry.js';
import { CLOCK, setClockPaused } from './clock.js';

const LEVEL = 1;

export async function boot(host, urlParams) {
  const params = {
    task: urlParams.get('task'),
    seed: parseInt(urlParams.get('seed'), 10),
    cue: urlParams.get('cue') ?? '',
  };
  CLOCK.step = true;
  setClockPaused(true);
  const index = await loadAssetIndex('.');
  await loadFonts(index);
  const bench = new BenchSession(new Panel(host), index, params);
  await bench.load();
  window.TuringSpace = bench.publicApi();
  return bench;
}

export class BenchSession {
  constructor(panel, index, params) {
    this.panel = panel;
    this.index = index;
    this.params = params;
  }

  async load() {
    const task = REGISTRY[this.params.task];
    if (!task) throw new Error('unknown task: ' + this.params.task);
    this.task = task;
    const rng = mulberry32(taskSeed(task.meta.name, LEVEL, this.params.seed));
    this.manifest = task.generate(R(rng), LEVEL, this.index, { cue: this.params.cue, lang: '' });
    this.state = task.init(this.manifest);
    this.env = {
      manifest: this.manifest, state: this.state, index: this.index,
      skin: 'photo', level: LEVEL, mode: 'bench', submitted: false, assets: {}, style: null,
    };
    this.submitted = false;
    this.lastResult = null;
    this.t0 = performance.now();
    if (task.mount) await task.mount(this.env);
    this.panel.setTask(task, this.env, {
      dispatch: (a) => this.dispatch(a),
      submit: () => this.submit(),
      refresh: () => {},
    });
  }

  dispatch(action) {
    if (this.submitted) return { ok: false, reason: 'locked' };
    const r = this.task.applyAction(this.state, action, this.manifest, this.env) || { ok: true };
    this.panel.redraw();
    this.panel.poke();
    return r;
  }

  submit() {
    if (this.submitted) return this.lastResult;
    const res = this.task.verify(this.state, this.manifest);
    this.lastResult = res;
    this.submitted = true;
    this.env.submitted = true;
    this.panel.showResult(res, { timeMs: performance.now() - this.t0 });
    this.panel.locked = true;
    return res;
  }

  publicApi() {
    return {
      getResult: () => this.lastResult ?? null,
      describe: () => ({ task: this.task.meta.name, boardRect: this.panel.boardRect() }),
    };
  }
}
