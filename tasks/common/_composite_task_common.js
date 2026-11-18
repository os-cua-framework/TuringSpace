import { UI_FONT, ACCENT, rr } from '../core/panel.js';

const DEFAULT_BOARD = Object.freeze({ w: 340, h: 360 });
const TAU = Math.PI * 2;

const clone = (value) => JSON.parse(JSON.stringify(value));

function drawReviewPrompt(g, rect, main, sub) {
  const wrap = (text, size, weight) => {
    g.font = `${weight} ${size}px ${UI_FONT}`;
    const lines = [];
    for (const para of String(text).split('\n')) {
      const tokens = para.match(/[\u2E80-\u9FFF\uFF00-\uFFEF]|[^\s\u2E80-\u9FFF\uFF00-\uFFEF]+\s*|\s+/g) || [''];
      let line = '';
      for (const tok of tokens) {
        if (line && g.measureText((line + tok).trimEnd()).width > rect.w) { lines.push(line.trimEnd()); line = tok.trimStart(); }
        else line += tok;
      }
      lines.push(line.trimEnd());
    }
    return lines;
  };
  let size = 14, mainLines, subLines, height;
  do {
    mainLines = wrap(main, size, 600); subLines = wrap(sub, 11, 400);
    height = mainLines.length * (size + 3) + subLines.length * 14 + 4;
    if (height <= rect.h - 6 || size <= 11) break;
    size--;
  } while (true);
  let y = rect.y + Math.max(3, (rect.h - height) / 2);
  g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = '#33434f'; g.font = `600 ${size}px ${UI_FONT}`;
  for (const line of mainLines) { g.fillText(line, rect.x, y); y += size + 3; }
  y += 4; g.font = `400 11px ${UI_FONT}`; g.fillStyle = '#657988';
  for (const line of subLines) { g.fillText(line, rect.x, y); y += 14; }
  g.textBaseline = 'middle';
}

function finiteTree(value, depth = 0) {
  if (depth > 12) return false;
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((v) => finiteTree(v, depth + 1));
  if (typeof value === 'object') return Object.values(value).every((v) => finiteTree(v, depth + 1));
  return false;
}

function candidatesOf(scene) {
  return Array.isArray(scene?.candidates) ? scene.candidates : [];
}

function cameraCandidatesOf(scene) {
  return Array.isArray(scene?.cameraCandidates) ? scene.cameraCandidates : [];
}

function validCandidates(scene, board, min = 5) {
  const cs = candidatesOf(scene);
  if (cs.length < min) return false;
  const ids = new Set();
  for (const [i, c] of cs.entries()) {
    if (!c || !Number.isInteger(c.id) || c.id !== i || ids.has(c.id)) return false;
    if (![c.x, c.y].every(Number.isFinite)) return false;
    if (c.x < 12 || c.x > board.w - 12 || c.y < 12 || c.y > board.h - 12) return false;
    ids.add(c.id);
  }
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      if (Math.hypot(cs[i].x - cs[j].x, cs[i].y - cs[j].y) < 24) return false;
    }
  }
  return true;
}

function normalizedAnswer(value) {
  if (Array.isArray(value)) return value.slice();
  return value;
}

function answerEqual(a, b) {
  return JSON.stringify(normalizedAnswer(a)) === JSON.stringify(normalizedAnswer(b));
}

function candidateExists(scene, id) {
  return Number.isInteger(id) && id >= 0 && id < candidatesOf(scene).length;
}

function cameraCandidateExists(scene, id) {
  return Number.isInteger(id) && id >= 0 && id < cameraCandidatesOf(scene).length;
}

function pairedAnswerExists(scene, answer) {
  return answer && typeof answer === 'object' && !Array.isArray(answer)
    && cameraCandidateExists(scene, answer.camera) && candidateExists(scene, answer.view);
}

function nearestCandidate(scene, x, y, radius) {
  let best = -1;
  let distance = Infinity;
  for (const c of candidatesOf(scene)) {
    const d = Math.hypot(x - c.x, y - c.y);
    const hit = Number.isFinite(c.hitRadius) ? c.hitRadius : radius;
    const within = c.hitBox ? x >= c.hitBox.x && x <= c.hitBox.x + c.hitBox.w && y >= c.hitBox.y && y <= c.hitBox.y + c.hitBox.h : d <= hit;
    if (within && d < distance) {
      best = c.id;
      distance = d;
    }
  }
  return best;
}

function nearestCameraCandidate(scene, x, y, radius) {
  return nearestCandidate({ candidates: cameraCandidatesOf(scene) }, x, y, radius);
}

function seededShuffle(values, rnd) {
  const out = values.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function checkedScene(spec, rng, round) {
  for (let attempt = 0; attempt < (spec.generationAttempts || 80); attempt++) {
    const scene = spec.buildScene(rng, round, attempt);
    if (!scene || !finiteTree(scene)) continue;
    const board = spec.board || DEFAULT_BOARD;
    if (!validCandidates(scene, board, spec.minCandidates || 5)) continue;
    const answer = spec.solve(scene);
    const okAnswer = spec.mode === 'rounds'
      ? candidateExists(scene, answer)
      : spec.mode === 'paired'
        ? validCandidates({ candidates: cameraCandidatesOf(scene) }, board, spec.minCameraCandidates || 5)
          && pairedAnswerExists(scene, answer)
        : Array.isArray(answer) && answer.length > 0 && answer.every((id) => candidateExists(scene, id));
    if (!okAnswer) continue;
    if (typeof spec.validateScene === 'function' && spec.validateScene(scene, answer) !== true) continue;
    return { ...scene, answer: normalizedAnswer(answer) };
  }
  if (typeof spec.fallbackScene === 'function') {
    const fallback = clone(spec.fallbackScene(round));
    fallback.answer = normalizedAnswer(spec.solve(fallback));
    return fallback;
  }
  throw new Error(`${spec.name}: failed to construct a valid scene`);
}

function contractOk(spec, manifest) {
  if (!manifest || manifest.task !== spec.name || !finiteTree(manifest)) return false;
  const board = spec.board || DEFAULT_BOARD;
  if (!manifest.board || manifest.board.w !== board.w || manifest.board.h !== board.h) return false;
  if (!Array.isArray(manifest.rounds) || manifest.rounds.length !== (spec.roundCount || (spec.mode === 'rounds' ? 2 : 1))) return false;
  for (const scene of manifest.rounds) {
    if (!validCandidates(scene, board, spec.minCandidates || 5)) return false;
    let answer;
    try { answer = spec.solve(scene); } catch { return false; }
    const okAnswer = spec.mode === 'rounds'
      ? candidateExists(scene, answer)
      : spec.mode === 'paired'
        ? validCandidates({ candidates: cameraCandidatesOf(scene) }, board, spec.minCameraCandidates || 5)
          && pairedAnswerExists(scene, answer)
        : Array.isArray(answer) && answer.length > 0 && answer.every((id) => candidateExists(scene, id));
    if (!okAnswer || !answerEqual(scene.answer, answer)) return false;
    if (typeof spec.validateScene === 'function' && spec.validateScene(scene, answer) !== true) return false;
  }
  if (spec.mode === 'rounds') {
    if (!Array.isArray(manifest.answers) || manifest.answers.length !== manifest.rounds.length) return false;
    if (!manifest.answers.every((a, i) => a === manifest.rounds[i].answer)) return false;
  } else if (spec.mode === 'ordered') {
    if (!answerEqual(manifest.order, manifest.rounds[0].answer)) return false;
    if (new Set(manifest.order).size !== manifest.order.length) return false;
  } else if (spec.mode === 'subset') {
    const sorted = manifest.rounds[0].answer.slice().sort((a, b) => a - b);
    if (!answerEqual(manifest.answerSet, sorted)) return false;
    if (new Set(sorted).size !== sorted.length) return false;
  } else if (spec.mode === 'paired') {
    if (!pairedAnswerExists(manifest.rounds[0], manifest.pair)) return false;
    if (!answerEqual(manifest.pair, manifest.rounds[0].answer)) return false;
  } else return false;
  return typeof spec.validateManifest !== 'function' || spec.validateManifest(manifest) === true;
}

function roundResult(state, manifest) {
  let correct = 0;
  for (let i = 0; i < manifest.answers.length; i++) if (state.picks[i] === manifest.answers[i]) correct++;
  const done = state.picks.length === manifest.answers.length;
  return {
    success: done && correct === manifest.answers.length,
    error: manifest.answers.length - correct,
    partial: correct / manifest.answers.length,
    detail: { completed: state.picks.length, correct, required: manifest.answers.length },
  };
}

function orderedResult(state, manifest) {
  let prefix = 0;
  while (prefix < state.sequence.length && state.sequence[prefix] === manifest.order[prefix]) prefix++;
  const done = state.sequence.length === manifest.order.length;
  return {
    success: done && prefix === manifest.order.length,
    error: done && prefix === manifest.order.length ? 0 : 1,
    partial: prefix / manifest.order.length,
    detail: { completed: state.sequence.length, correctPrefix: prefix, required: manifest.order.length },
  };
}

function subsetResult(state, manifest) {
  const want = new Set(manifest.answerSet);
  const got = new Set(state.selected);
  const correct = [...want].filter((id) => got.has(id)).length;
  const falsePositive = [...got].filter((id) => !want.has(id)).length;
  return {
    success: correct === want.size && falsePositive === 0,
    error: want.size - correct + falsePositive,
    partial: Math.max(0, (correct - falsePositive) / want.size),
    detail: { selected: got.size, correct, falsePositive, required: want.size },
  };
}

function pairedResult(state, manifest) {
  const completed = Number(state.camera != null) + Number(state.view != null);
  const correct = Number(state.camera === manifest.pair.camera) + Number(state.view === manifest.pair.view);
  return {
    success: completed === 2 && correct === 2,
    error: 2 - correct,
    partial: correct / 2,
    detail: { completed, correct, required: 2 },
  };
}

function advanceRound(state, idx, manifest, allowRevise = false) {
  if (!candidateExists(manifest.rounds[state.round], idx)) return { ok: false, reason: 'bad-idx' };
  if (allowRevise && manifest.rounds.length === 1) {
    state.picks[0] = idx;
    state.round = 0;
    state.grabbed = false;
    state.cursor = null;
    return { ok: true };
  }
  state.picks.push(idx);
  state.round++;
  state.grabbed = false;
  state.cursor = null;
  return { ok: true };
}

function selectedSet(state, mode, round) {
  if (mode === 'rounds') return state.picks[round] == null ? new Set() : new Set([state.picks[round]]);
  if (mode === 'paired') return state.view == null ? new Set() : new Set([state.view]);
  if (mode === 'ordered') return new Set(state.sequence);
  return new Set(state.selected);
}

function drawCommonCandidateFeedback(g, scene, selected, sequence) {
  for (const c of candidatesOf(scene)) {
    if (!selected.has(c.id)) continue;
    g.save();
    g.beginPath(); g.arc(c.x, c.y, (c.hitRadius || 18) + 3, 0, TAU);
    g.strokeStyle = ACCENT; g.lineWidth = 3; g.stroke();
    if (sequence) {
      const k = sequence.indexOf(c.id);
      if (k >= 0) {
        g.beginPath(); g.arc(c.x + 13, c.y - 13, 9, 0, TAU); g.fillStyle = ACCENT; g.fill();
        g.font = `700 11px ${UI_FONT}`; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(k + 1), c.x + 13, c.y - 12.5);
      }
    }
    g.restore();
  }
}

function drawDragSource(g, scene, state) {
  if (!scene.source || scene.drawSource === false) return;
  const placed = Array.isArray(state.picks) && Number.isInteger(state.picks[state.round])
    ? scene.candidates[state.picks[state.round]] : null;
  const p = state.cursor && state.grabbed ? state.cursor : placed || scene.source;
  g.save();
  g.beginPath(); g.arc(p.x, p.y, scene.source.r || 15, 0, TAU);
  g.fillStyle = '#46a2ef'; g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.stroke();
  if (scene.source.label) {
    g.fillStyle = '#fff'; g.font = `800 12px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(scene.source.label, p.x, p.y + .5);
  } else {
    g.beginPath(); g.moveTo(p.x - 6, p.y); g.lineTo(p.x + 6, p.y);
    g.moveTo(p.x, p.y - 6); g.lineTo(p.x, p.y + 6);
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
  }
  g.restore();
}

export function makeCompositeTask(spec) {
  if (!spec || !spec.name || !['rounds', 'ordered', 'subset', 'paired'].includes(spec.mode)) {
    throw new Error('invalid composite task spec');
  }
  const board = Object.freeze({ ...(spec.board || DEFAULT_BOARD) });
  const rounds = spec.roundCount || (spec.mode === 'rounds' ? 2 : 1);
  const gesture = spec.gesture || 'pick';
  const hitRadius = spec.hitRadius || 22;

  const gate = (manifest) => contractOk({ ...spec, board, roundCount: rounds }, manifest);

  const task = {
    meta: {
      name: spec.name,
      family: spec.family,
      baseFamily: spec.baseFamily || spec.family,
      boardH: board.h + 10,
      headerH: spec.headerH || 82,
      footer: 'verify',
      board,
      actionSpace: spec.mode === 'paired'
        ? [{ op: 'pick-camera', idx: 'camera candidate id' }, { op: 'pick-view', idx: 'view candidate id' }]
        : spec.mode === 'rounds'
        ? (gesture === 'drag'
          ? [{ op: 'grab' }, { op: 'drag', x: '0..340 board px', y: `0..${board.h} board px` }, { op: 'drop', idx: 'candidate id' }]
          : [{ op: 'pick', idx: 'candidate id' }])
        : [{ op: spec.mode === 'ordered' ? 'tap' : 'toggle', idx: 'candidate id' }],
      promptHuman: spec.promptHuman,
      taxonomy: Object.freeze({
        version: 2,
        primaryFamily: spec.family,
        spatialCore: spec.spatialCore,
        secondaryCapability: spec.secondaryCapability || 'none',
      }),
      interactionVerbs: Object.freeze((spec.interactionVerbs || [gesture]).slice()),
      estimatedGuessRate: spec.estimatedGuessRate,
      operationBudget: spec.operationBudget || 12,
      toleranceDesign: spec.toleranceDesign,
      closestExisting: spec.closestExisting,
    },

    generate(rng, level, index, knobs) {
      const scenes = [];
      const ext = knobs && knobs.ext && typeof spec.buildSceneExt === 'function' ? knobs : null;
      const sceneSpec = ext
        ? { ...spec, board, generationAttempts: spec.extGenerationAttempts || spec.generationAttempts,
          buildScene: (r, round, attempt) => spec.buildSceneExt(r, round, attempt, ext) }
        : null;
      for (let r = 0; r < rounds; r++) scenes.push(checkedScene(sceneSpec || { ...spec, board }, rng, r));
      const manifest = {
        task: spec.name,
        board,
        taxonomyVersion: 2,
        rounds: scenes,
        gtContract: spec.gtContract,
      };
      if (spec.mode === 'rounds') manifest.answers = scenes.map((s) => s.answer);
      else if (spec.mode === 'paired') manifest.pair = clone(scenes[0].answer);
      else if (spec.mode === 'ordered') manifest.order = scenes[0].answer.slice();
      else manifest.answerSet = scenes[0].answer.slice().sort((a, b) => a - b);
      if (!gate(manifest)) throw new Error(`${spec.name}: generated manifest violates gate`);
      return manifest;
    },

    init() {
      if (spec.mode === 'rounds') return { round: 0, picks: [], grabbed: false, cursor: null };
      if (spec.mode === 'paired') return { round: 0, camera: null, view: null, grabbed: false, cursor: null };
      if (spec.mode === 'ordered') return { round: 0, sequence: [], grabbed: false, cursor: null };
      return { round: 0, selected: [], grabbed: false, cursor: null };
    },

    applyAction(state, action, manifest) {
      if (!action || typeof action.op !== 'string') return { ok: false, reason: 'bad-action' };
      if (spec.mode === 'rounds') {
        if (state.round >= manifest.rounds.length) return { ok: false, reason: 'done' };
        if (action.op === 'cancel-drag' && gesture === 'drag') { state.grabbed = false; state.cursor = null; return { ok: true }; }
        if (action.op === 'grab' && gesture === 'drag') {
          state.grabbed = true;
          const scene = manifest.rounds[state.round];
          const placed = spec.allowReviseBeforeVerify && Number.isInteger(state.picks[state.round])
            ? scene.candidates[state.picks[state.round]] : null;
          state.cursor = placed ? { x: placed.x, y: placed.y } : scene.source ? { ...scene.source } : null;
          return { ok: true };
        }
        if (action.op === 'drag' && gesture === 'drag' && state.grabbed && Number.isFinite(action.x) && Number.isFinite(action.y)) {
          state.cursor = spec.constrainDrag ? spec.constrainDrag(manifest.rounds[state.round], action) : { x: action.x, y: action.y };
          return { ok: true };
        }
        if (action.op === 'drop' && gesture === 'drag' && state.grabbed) return advanceRound(state, action.idx, manifest, spec.allowReviseBeforeVerify);
        if (action.op === 'pick' && gesture !== 'drag') return advanceRound(state, action.idx, manifest, spec.allowReviseBeforeVerify);
        return { ok: false, reason: 'bad-op' };
      }
      const scene = manifest.rounds[0];
      if (spec.mode === 'paired') {
        if (action.op === 'pick-camera' && cameraCandidateExists(scene, action.idx)
          && (spec.pairedAnyOrder || state.view == null || spec.allowReviseBeforeVerify)) {
          state.camera = action.idx;
          return { ok: true };
        }
        if (action.op === 'pick-view' && (state.view == null || spec.allowReviseBeforeVerify)
          && (spec.pairedAnyOrder || state.camera != null) && candidateExists(scene, action.idx)) {
          state.view = action.idx;
          return { ok: true };
        }
        return { ok: false, reason: state.camera == null ? 'pick-camera-first' : 'bad-op' };
      }
      if (!candidateExists(scene, action.idx)) return { ok: false, reason: 'bad-idx' };
      if (spec.mode === 'ordered') {
        if (action.op !== 'tap') return { ok: false, reason: 'bad-op' };
        const at = state.sequence.indexOf(action.idx);
        if (at >= 0) { state.sequence.length = at; return { ok: true }; }
        if (state.sequence.length >= scene.answer.length) return { ok: false, reason: 'full' };
        state.sequence.push(action.idx);
        return { ok: true };
      }
      if (action.op !== 'toggle') return { ok: false, reason: 'bad-op' };
      const at = state.selected.indexOf(action.idx);
      if (at >= 0) state.selected.splice(at, 1); else state.selected.push(action.idx);
      state.selected.sort((a, b) => a - b);
      return { ok: true };
    },

    verify(state, manifest) {
      if (spec.mode === 'rounds') return roundResult(state, manifest);
      if (spec.mode === 'paired') return pairedResult(state, manifest);
      if (spec.mode === 'ordered') return orderedResult(state, manifest);
      return subsetResult(state, manifest);
    },

    oracle(manifest) {
      if (spec.mode === 'rounds') {
        if (gesture !== 'drag') return manifest.answers.map((idx) => ({ op: 'pick', idx }));
        return manifest.answers.flatMap((idx, round) => {
          const point = manifest.rounds[round].candidates[idx];
          return [{ op: 'grab' }, { op: 'drag', x: point.x, y: point.y }, { op: 'drop', idx }];
        });
      }
      if (spec.mode === 'paired') return [
        { op: 'pick-camera', idx: manifest.pair.camera },
        { op: 'pick-view', idx: manifest.pair.view },
      ];
      if (spec.mode === 'ordered') return manifest.order.map((idx) => ({ op: 'tap', idx }));
      return manifest.answerSet.map((idx) => ({ op: 'toggle', idx }));
    },

    randomPolicy(manifest, rnd) {
      if (spec.mode === 'rounds') {
        if (gesture !== 'drag') return manifest.rounds.map((scene) => ({
          op: 'pick', idx: Math.floor(rnd() * scene.candidates.length),
        }));
        return manifest.rounds.flatMap((scene) => {
          const idx = Math.floor(rnd() * scene.candidates.length);
          const point = scene.candidates[idx];
          return [{ op: 'grab' }, { op: 'drag', x: point.x, y: point.y }, { op: 'drop', idx }];
        });
      }
      if (spec.mode === 'paired') return [
        { op: 'pick-camera', idx: Math.floor(rnd() * manifest.rounds[0].cameraCandidates.length) },
        { op: 'pick-view', idx: Math.floor(rnd() * manifest.rounds[0].candidates.length) },
      ];
      const scene = manifest.rounds[0];
      const ids = seededShuffle(scene.candidates.map((c) => c.id), rnd);
      const k = spec.mode === 'ordered' ? manifest.order.length : manifest.answerSet.length;
      return ids.slice(0, k).map((idx) => ({ op: spec.mode === 'ordered' ? 'tap' : 'toggle', idx }));
    },

    async mount(env) { if (typeof spec.mount === 'function') await spec.mount(env); },

    drawPrompt(g, rect, env) {
      const state = env.state;
      const round = spec.mode === 'rounds' ? Math.min(state.round, env.manifest.rounds.length - 1) : 0;
      const scene = env.manifest.rounds[round];
      const prompt = typeof spec.promptDrawnForScene === 'function' ? spec.promptDrawnForScene(scene)
        : spec.promptDrawn || (typeof spec.promptHumanForScene === 'function'
          ? spec.promptHumanForScene(scene) : spec.promptMain);
      const promptSub = typeof spec.promptDrawnSubForScene === 'function' ? spec.promptDrawnSubForScene(scene)
        : spec.promptDrawnSub ?? (typeof spec.promptSubForScene === 'function'
          ? spec.promptSubForScene(scene) : 'Make your choice, then press Verify.');
      const suffix = spec.mode === 'rounds' && rounds > 1 ? ` · ${Math.min(state.round + 1, rounds)}/${rounds}` : '';
      drawReviewPrompt(
        g,
        rect,
        `${prompt}${suffix}`,
        promptSub,
      );
    },

    drawBoard(g, br, env) {
      const { manifest, state } = env;
      const round = spec.mode === 'rounds' ? Math.min(state.round, manifest.rounds.length - 1) : 0;
      const scene = manifest.rounds[round];
      g.save(); g.translate(br.x, br.y);
      const bg = g.createLinearGradient(0, 0, 0, board.h);
      bg.addColorStop(0, '#f7f9fc'); bg.addColorStop(1, '#edf1f5');
      g.fillStyle = bg; g.fillRect(0, 0, board.w, board.h);
      if (typeof spec.drawScene === 'function') spec.drawScene(g, scene, { state, round, board, env });
      const selected = selectedSet(state, spec.mode, round);
      if (!spec.customSelectionFeedback) drawCommonCandidateFeedback(g, scene, selected, spec.mode === 'ordered' ? state.sequence : null);
      if (gesture === 'drag' && spec.mode === 'rounds') drawDragSource(g, scene, state);
      if (spec.mode === 'rounds' && rounds > 1) {
        rr(g, 8, 8, 48, 24, 12); g.fillStyle = 'rgba(255,255,255,.88)'; g.fill();
        g.strokeStyle = 'rgba(110,130,150,.25)'; g.stroke();
        g.font = `600 11px ${UI_FONT}`; g.fillStyle = '#718096'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(`${round + 1} / ${rounds}`, 32, 20.5);
      }
      g.restore();
    },

    pointer(evt, env) {
      const state = env.state;
      const manifest = env.manifest;
      const round = spec.mode === 'rounds' ? Math.min(state.round, manifest.rounds.length - 1) : 0;
      const scene = manifest.rounds[round];
      if (spec.mode === 'rounds' && gesture === 'drag') {
        if (evt.type === 'down') {
          const placed = spec.allowReviseBeforeVerify && Number.isInteger(state.picks[state.round])
            ? scene.candidates[state.picks[state.round]] : null;
          const source = placed ? { ...placed, r: scene.source?.r || 20 }
            : scene.source || { x: board.w / 2, y: board.h - 30, r: 20 };
          return Math.hypot(evt.x - source.x, evt.y - source.y) <= (source.r || 20) + 8 ? [{ op: 'grab' }] : [];
        }
        if (evt.type === 'move' && state.grabbed) return [{ op: 'drag', x: evt.x, y: evt.y }];
        if (evt.type === 'up' && state.grabbed) {
          const idx = nearestCandidate(scene, evt.x, evt.y, hitRadius);
          return idx >= 0 ? [{ op: 'drop', idx }] : [{ op: 'cancel-drag' }];
        }
        return [];
      }
      if (evt.type !== 'down') return [];
      if (spec.mode === 'paired') {
        const camera = nearestCameraCandidate(scene, evt.x, evt.y, hitRadius);
        if (camera >= 0 && (state.camera == null || spec.allowReviseBeforeVerify) && (spec.pairedAnyOrder || state.view == null || spec.allowReviseBeforeVerify)) return [{ op: 'pick-camera', idx: camera }];
        if (state.camera == null && !spec.pairedAnyOrder) return [];
        const view = nearestCandidate(scene, evt.x, evt.y, hitRadius);
        return view >= 0 && (state.view == null || spec.allowReviseBeforeVerify) ? [{ op: 'pick-view', idx: view }] : [];
      }
      const idx = nearestCandidate(scene, evt.x, evt.y, hitRadius);
      if (idx < 0) return [];
      return [{ op: spec.mode === 'rounds' ? 'pick' : spec.mode === 'ordered' ? 'tap' : 'toggle', idx }];
    },

    footerStatus(env) {
      if (spec.mode === 'rounds') return rounds > 1 ? `${env.state.picks.length} of ${rounds} picked` : (env.state.picks.length ? 'tap another option to change, then Verify' : 'tap an option');
      if (spec.mode === 'paired') {
        const labels = spec.pairedStepLabels || ['Step 1/2 · pick a plan camera', 'Step 2/2 · pick its A–E view'];
        return env.state.camera == null ? labels[0] : labels[1];
      }
      if (spec.mode === 'ordered') return `${env.state.sequence.length} of ${env.manifest.order.length} points · tap a numbered point to take it back`;
      return `${env.state.selected.length} selected`;
    },
  };

  return Object.freeze({ task, gate });
}
