export function roundsPick({ rounds }) {
  return {
    init() { return { round: 0, picks: [] }; },
    applyAction(state, action, manifest) {
      if (action.op !== 'pick' || !Number.isInteger(action.idx)) return { ok: false, reason: 'bad-op' };
      if (state.round >= rounds(manifest)) { state.picks[rounds(manifest) - 1] = action.idx; return { ok: true }; }
      state.picks.push(action.idx);
      state.round++;
      return { ok: true };
    },
    verify(state, manifest) {
      const ans = manifest.answers;
      const R = rounds(manifest);
      let good = 0;
      for (let r = 0; r < R; r++) if (state.picks[r] === ans[r]) good++;
      return {
        success: state.picks.length === R && good === R,
        error: R - good,
        partial: good / R,
        detail: { rounds: state.picks.length, correct: good },
      };
    },
    oracle(manifest) { return manifest.answers.map((idx) => ({ op: 'pick', idx })); },
  };
}

export function orderedTaps() {
  return {
    init() { return { seq: [] }; },
    applyAction(state, action, manifest) {
      if (action.op !== 'tap' || !Number.isInteger(action.idx)) return { ok: false, reason: 'bad-op' };
      const n = manifest.order.length;
      if (action.idx < 0 || action.idx >= n) return { ok: false, reason: 'bad-idx' };
      const at = state.seq.indexOf(action.idx);
      if (at >= 0) { state.seq.length = at; return { ok: true }; }
      state.seq.push(action.idx);
      return { ok: true };
    },
    verify(state, manifest) {
      const a = manifest.order;
      let prefix = 0;
      while (prefix < state.seq.length && state.seq[prefix] === a[prefix]) prefix++;
      return {
        success: state.seq.length === a.length && prefix === a.length,
        error: prefix === a.length && state.seq.length === a.length ? 0 : 1,
        partial: prefix / a.length,
        detail: { tapped: state.seq.length, correctPrefix: prefix },
      };
    },
    oracle(manifest) { return manifest.order.map((idx) => ({ op: 'tap', idx })); },
  };
}

export function subsetToggle({ nTargets }) {
  return {
    init(manifest) { return { sel: new Array(nTargets(manifest)).fill(false) }; },
    applyAction(state, action) {
      if (action.op !== 'toggle' || !Number.isInteger(action.idx)) return { ok: false, reason: 'bad-op' };
      if (action.idx < 0 || action.idx >= state.sel.length) return { ok: false, reason: 'bad-idx' };
      state.sel[action.idx] = !state.sel[action.idx];
      return { ok: true };
    },
    verify(state, manifest) {
      const want = new Set(manifest.answerSet);
      let correct = 0, selN = 0, tp = 0;
      for (let i = 0; i < state.sel.length; i++) {
        const is = want.has(i);
        if (state.sel[i]) { selN++; if (is) tp++; }
        if (state.sel[i] === is) correct++;
      }
      return {
        success: selN === want.size && tp === want.size,
        error: state.sel.length - correct,
        partial: correct / state.sel.length,
        detail: { selected: selN, want: want.size },
      };
    },
    oracle(manifest) { return manifest.answerSet.map((idx) => ({ op: 'toggle', idx })); },
  };
}
