import { UI_FONT } from '../core/panel.js';

const TAU = Math.PI * 2;
const EPS = 1e-7;
const BOARD = Object.freeze({ w: 340, h: 360 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rotate = (p, c, a) => {
  const x = p.x - c.x, y = p.y - c.y, co = Math.cos(a), si = Math.sin(a);
  return { x: c.x + x * co - y * si, y: c.y + x * si + y * co };
};
const candidateLabel = (id) => String.fromCharCode(65 + id);

function shuffledCandidates(rng, raw) {
  return rng.shuffle(raw).map((c, id) => ({ ...c, id }));
}

function pairwiseSeparated(points, gap = 24) {
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) if (dist(points[i], points[j]) < gap) return false;
  }
  return true;
}

function drawBadge(g, c, fill = '#fff', stroke = '#49647d', radius = 12) {
  g.beginPath(); g.arc(c.x, c.y, radius, 0, TAU);
  g.fillStyle = fill; g.fill(); g.strokeStyle = stroke; g.lineWidth = 1.8; g.stroke();
  g.fillStyle = stroke; g.font = `700 10px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(candidateLabel(c.id), c.x, c.y + .3);
}

function baseMeta(overrides) {
  const spec = {
    board: BOARD,
    baseFamily: overrides.family,
    secondaryCapability: 'none',
    operationBudget: 2,
    estimatedGuessRate: .04,
    ...overrides,
  };
  if (!spec.promptHuman) {
    const sub = spec.promptSub ? spec.promptSub[0].toUpperCase() + spec.promptSub.slice(1) : '';
    spec.promptHuman = `${spec.promptMain}. ${sub}.`;
  }
  return spec;
}

function pointInPolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > p.y) !== (b.y > p.y)
      && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function enclosingCyclesAfterCuts(scene, removedIds) {
  const removed = new Set(removedIds);
  const adjacency = Array.from({ length: scene.nodes.length }, () => []);
  scene.edges.forEach((edge, edgeIndex) => {
    if (edge.candidateId != null && removed.has(edge.candidateId)) return;
    adjacency[edge.a].push({ next: edge.b, edgeIndex });
    adjacency[edge.b].push({ next: edge.a, edgeIndex });
  });
  const cycleKeys = new Set();
  let enclosing = 0;
  const visit = (start, current, path, usedNodes, usedEdges) => {
    for (const { next, edgeIndex } of adjacency[current]) {
      if (usedEdges.has(edgeIndex)) continue;
      if (next === start && path.length >= 3) {
        const key = [...usedEdges, edgeIndex].sort((a, b) => a - b).join(',');
        if (cycleKeys.has(key)) continue;
        cycleKeys.add(key);
        if (pointInPolygon(scene.peg, path.map((id) => scene.nodes[id]))) enclosing++;
      } else if (!usedNodes.has(next)) {
        usedNodes.add(next); usedEdges.add(edgeIndex); path.push(next);
        visit(start, next, path, usedNodes, usedEdges);
        path.pop(); usedEdges.delete(edgeIndex); usedNodes.delete(next);
      }
    }
  };
  for (let start = 0; start < scene.nodes.length; start++) {
    visit(start, start, [start], new Set([start]), new Set());
  }
  return enclosing;
}

export const slipknotReleasePickSpec = baseMeta({
  name: 'slipknot_release_pick', family: 'A', mode: 'subset', roundCount: 1,
  spatialCore: 'enclosing-cycle persistence after removal of a connected rope span', secondaryCapability: 'causal-counterfactual',
  interactionVerbs: ['select-first-bar', 'select-second-bar'], operationBudget: 2, estimatedGuessRate: .0476,
  promptMain: 'Remove two bars to open every loop around the peg',
  promptSub: 'both enclosing loops must be broken in the same scene',
  gtContract: 'among all pairs of removable rendered edges, choose the unique pair whose deletion leaves no simple cycle enclosing the peg',
  toleranceDesign: 'seven numbered orange bars with 20 px click badges; the unique two-bar cut has 1/21 blind probability',
  closestExisting: 'rope_thread_topology; adds two direct edge removals inside one persistent graph',
  buildScene(rng) {
    const nodes = [[70, 90], [270, 90], [270, 270], [70, 270], [170, 120], [240, 180], [170, 240], [100, 180],
      [38, 52], [302, 52], [306, 306], [34, 306]].map(([x, y]) => ({ x: x + rng.int(-7, 7), y: y + rng.int(-7, 7) }));
    const loops = [[[0, 1], [1, 2], [2, 3], [3, 0]], [[4, 5], [5, 6], [6, 7], [7, 4]]];
    const cuts = [rng.int(0, 3), rng.int(0, 3)];
    const fixed = loops.flatMap((loop, i) => loop.filter((_, j) => j !== cuts[i]));
    const removable = [
      ...loops.map((loop, i) => ({ a: loop[cuts[i]][0], b: loop[cuts[i]][1], release: true })),
      { a: 0, b: 8 }, { a: 1, b: 9 }, { a: 2, b: 10 }, { a: 3, b: 11 }, { a: 5, b: 1 },
    ];
    const shuffled = rng.shuffle(removable);
    const candidates = shuffled.map((edge, id) => ({
      id, x: (nodes[edge.a].x + nodes[edge.b].x) / 2, y: (nodes[edge.a].y + nodes[edge.b].y) / 2,
      hitRadius: 20, release: !!edge.release,
    }));
    const edges = fixed.map(([a, b]) => ({ a, b, candidateId: null }));
    shuffled.forEach((edge, candidateId) => edges.push({ a: edge.a, b: edge.b, candidateId }));
    return { nodes, edges, candidates, peg: { x: 170, y: 180 } };
  },
  solve(scene) {
    return scene.candidates.filter((candidate) => candidate.release).map((candidate) => candidate.id).sort((a, b) => a - b);
  },
  validateScene(scene, answer) {
    if (!Array.isArray(answer) || answer.length !== 2 || enclosingCyclesAfterCuts(scene, answer) !== 0) return false;
    let successfulPairs = 0;
    for (let a = 0; a < scene.candidates.length; a++) for (let b = a + 1; b < scene.candidates.length; b++) {
      if (enclosingCyclesAfterCuts(scene, [a, b]) === 0) successfulPairs++;
    }
    return successfulPairs === 1 && pairwiseSeparated(scene.candidates, 28);
  },
  drawScene(g, scene, { state }) {
    g.textAlign = 'center';
    for (const edge of scene.edges) {
      const a = scene.nodes[edge.a], b = scene.nodes[edge.b];
      if (edge.candidateId != null && state.selected.includes(edge.candidateId)) { g.setLineDash([2, 6]); g.globalAlpha = .25; }
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
      g.strokeStyle = edge.candidateId == null ? '#54758c' : '#d66b43';
      g.lineWidth = edge.candidateId == null ? 6 : 9; g.lineCap = 'round'; g.stroke();
      g.setLineDash([]); g.globalAlpha = 1;
    }
    for (const p of scene.nodes) {
      g.beginPath(); g.arc(p.x, p.y, 4, 0, TAU); g.fillStyle = '#eff5f8'; g.fill();
      g.strokeStyle = '#416d8a'; g.lineWidth = 1.5; g.stroke();
    }
    g.beginPath(); g.arc(scene.peg.x, scene.peg.y, 11, 0, TAU); g.fillStyle = '#8c7958'; g.fill();
    g.fillStyle = '#fff'; g.font = `700 7px ${UI_FONT}`; g.textBaseline = 'middle'; g.fillText('Peg', scene.peg.x, scene.peg.y);
    for (const candidate of scene.candidates) {
      drawBadge(g, candidate, '#fff8f4', '#9a4934', 10);
    }
  },
});

function hingeTarget(scene) {
  return rotate(scene.start, scene.pivot, scene.turn);
}

export const hingeEndpointTransferSpec = baseMeta({
  name: 'hinge_endpoint_transfer', family: 'B', mode: 'rounds', roundCount: 1, gesture: 'drag', allowReviseBeforeVerify: true,
  spatialCore: 'rotation of an endpoint about a fixed pivot', interactionVerbs: ['grab', 'drag', 'place'], operationBudget: 6, estimatedGuessRate: .1429,
  promptMain: 'Rotate the hinged endpoint by the shown turn',
  promptSub: 'transfer the small cue arc to the full-length arm',
  gtContract: 'rotate the rendered start endpoint around the rendered pivot by the rendered signed angle; nearest socket wins',
  toleranceDesign: 'candidate sockets are 45+ px apart; 18 px drop targets avoid precision tax',
  closestExisting: 'articulated_arm_reach; isolates one rigid hinge transform without reachability search',
  buildScene(rng) {
    const pivot = { x: 170, y: 188 }, length = 94;
    const startAngle = rng.uniform(-2.55, -1.85);
    const turn = [Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI / 2][rng.int(0, 3)] * (rng.int(0, 1) ? 1 : -1);
    const start = { x: pivot.x + Math.cos(startAngle) * length, y: pivot.y + Math.sin(startAngle) * length };
    const targetAngle = startAngle + turn;
    const offsets = Array.from({ length: 8 }, (_, i) => i * Math.PI / 4)
      .filter((d) => Math.abs(Math.atan2(Math.sin(targetAngle + d - startAngle), Math.cos(targetAngle + d - startAngle))) > .38).slice(0, 7);
    const candidates = shuffledCandidates(rng, offsets.map((d) => ({
      x: pivot.x + Math.cos(targetAngle + d) * length, y: pivot.y + Math.sin(targetAngle + d) * length, hitRadius: 18,
    })));
    return { pivot, start, turn, length, candidates, source: { ...start, r: 14, label: '●' } };
  },
  constrainDrag(scene, point) {
    const angle = Math.atan2(point.y - scene.pivot.y, point.x - scene.pivot.x);
    return { x: scene.pivot.x + Math.cos(angle) * scene.length, y: scene.pivot.y + Math.sin(angle) * scene.length };
  },
  solve(scene) {
    const target = hingeTarget(scene);
    return scene.candidates.reduce((best, c) => dist(c, target) < dist(best, target) ? c : best, scene.candidates[0]).id;
  },
  validateScene(scene, answer) {
    const target = hingeTarget(scene), errors = scene.candidates.map((c) => dist(c, target)).sort((a, b) => a - b);
    return answer >= 0 && pairwiseSeparated(scene.candidates, 32) && errors[0] < EPS && errors[1] > 28;
  },
});
