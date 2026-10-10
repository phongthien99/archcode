import type { Relationship } from '../types';
import type { DependencyGraph } from './graph';

/**
 * Tìm các vòng phụ thuộc. Mỗi thành phần liên thông mạnh (Tarjan SCC) có ≥ 2 component
 * cho ra một vòng ngắn nhất đi qua component khai báo sớm nhất trong nhóm.
 * Quan hệ tự trỏ vào chính nó được báo riêng (self-loop) nên không tính ở đây.
 */
export function findCycles(graph: DependencyGraph): { cycle: Relationship[]; size: number }[] {
  const order = [...graph.components.keys()];
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let counter = 0;

  const next = (id: string) =>
    graph.outgoing
      .get(id)!
      .filter((r) => r.from !== r.to)
      .map((r) => r.to);

  // Tarjan dạng lặp để không tràn stack với đồ thị lớn.
  for (const root of order) {
    if (index.has(root)) continue;
    const work: { id: string; children: string[]; i: number }[] = [];
    const visit = (id: string) => {
      index.set(id, counter);
      low.set(id, counter);
      counter++;
      stack.push(id);
      onStack.add(id);
      work.push({ id, children: next(id), i: 0 });
    };
    visit(root);
    while (work.length) {
      const frame = work[work.length - 1]!;
      if (frame.i < frame.children.length) {
        const child = frame.children[frame.i++]!;
        if (!index.has(child)) visit(child);
        else if (onStack.has(child))
          low.set(frame.id, Math.min(low.get(frame.id)!, index.get(child)!));
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.id, Math.min(low.get(parent.id)!, low.get(frame.id)!));
      if (low.get(frame.id) === index.get(frame.id)) {
        const scc: string[] = [];
        let member: string;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          scc.push(member);
        } while (member !== frame.id);
        if (scc.length > 1) sccs.push(scc);
      }
    }
  }

  const position = new Map(order.map((id, i) => [id, i]));
  return sccs
    .map((scc) => {
      const members = new Set(scc);
      const start = scc.reduce((a, b) => (position.get(a)! <= position.get(b)! ? a : b));
      return { cycle: shortestCycle(graph, start, members), size: scc.length };
    })
    .sort((a, b) => position.get(a.cycle[0]!.from)! - position.get(b.cycle[0]!.from)!);
}

/** BFS từ `start` quay về `start`, chỉ đi trong nhóm `members`. */
function shortestCycle(
  graph: DependencyGraph,
  start: string,
  members: Set<string>,
): Relationship[] {
  const via = new Map<string, Relationship>();
  const queue = [start];
  while (queue.length) {
    const id = queue.shift()!;
    for (const rel of graph.outgoing.get(id)!) {
      if (rel.from === rel.to || !members.has(rel.to)) continue;
      if (rel.to === start) {
        const path = [rel];
        for (let cur = id; cur !== start; cur = via.get(cur)!.from) path.unshift(via.get(cur)!);
        return path;
      }
      if (!via.has(rel.to)) {
        via.set(rel.to, rel);
        queue.push(rel.to);
      }
    }
  }
  return [];
}
