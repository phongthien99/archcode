/**
 * Router orthogonal tránh node dùng libavoid (WASM). Cùng chữ ký với `routeEdges()` (thêm `options`):
 * WASM chưa nạp hoặc nạp lỗi → dùng router đơn giản trong `route.ts`.
 * Cấu hình theo spike: docs/spikes/libavoid.md.
 */
import { AvoidLib as untypedAvoidLib } from 'libavoid-js';
import type { Avoid, AvoidLibApi } from './libavoid-types';
import {
  labelPosition,
  routeEdges,
  type Box,
  type Point,
  type RouteRequest,
  type RouteResult,
} from './route';

/** Khoảng hở tối thiểu giữa connector và node. */
const SHAPE_BUFFER = 12;
/** Khoảng cách giữa các connector chạy song song. */
const NUDGING = 8;
/** Phạt mỗi lần gấp — thiếu tham số này libavoid chậm hơn ~6 lần (spike). */
const SEGMENT_PENALTY = 50;
/** Pin ở tâm node, mở cả 4 hướng; 4 pin giữa 4 cạnh làm không gian tìm kiếm bùng nổ (spike). */
const PIN_CLASS = 1;
/**
 * Nhóm connector (cùng router) lớn hơn ngưỡng này dùng router cũ: libavoid tăng thời gian rất nhanh
 * theo số connector — 80 connector ~180 ms, 200 connector 13–23 s (spike, rủi ro R-ROUTE-PERF).
 */
export const MAX_AVOID_EDGES = 100;
const CONN_DIR_ALL = 15;

const AvoidLib = untypedAvoidLib as unknown as AvoidLibApi;

let avoid: Avoid | undefined;
let loading: Promise<boolean> | undefined;
let defaultWasmUrl: string | undefined;

/**
 * Đặt URL của `libavoid.wasm` cho lần nạp sau (trình duyệt: URL asset có hash do bundler sinh) mà
 * chưa nạp ngay — WASM chỉ nạp ở lần layout thủ công đầu tiên (`layoutView`).
 */
export function setRouterWasmUrl(url: string): void {
  defaultWasmUrl = url;
}

/**
 * Nạp WASM một lần; gọi lại trả cùng promise. `true` = sẵn sàng, `false` = nạp lỗi (dùng router cũ).
 * `wasmUrl` mặc định lấy từ `setRouterWasmUrl`; Node tự tìm file cạnh module.
 */
export function loadRouter(wasmUrl = defaultWasmUrl): Promise<boolean> {
  loading ??= AvoidLib.load(wasmUrl).then(
    () => {
      avoid = AvoidLib.getInstance();
      return true;
    },
    () => false,
  );
  return loading;
}

export function routerReady(): boolean {
  return avoid !== undefined;
}

export interface AvoidGroup {
  id: string;
  parent?: string;
  box: Box;
}

export interface AvoidOptions {
  /** Khung group: connector chỉ được đi vào group chứa một trong hai đầu của nó. */
  groups?: AvoidGroup[];
  /** Group trực tiếp của từng node (theo ID node). */
  nodeGroup?: Map<string, string | undefined>;
}

/**
 * Định tuyến mọi connector, tránh đi xuyên node và group không liên quan.
 * Deterministic: cùng input → cùng đường đi.
 */
export function routeEdgesAvoid(
  boxes: Map<string, Box>,
  edges: RouteRequest[],
  options: AvoidOptions = {},
): Map<string, RouteResult> {
  if (!avoid) return routeEdges(boxes, edges);

  // Self-loop: vẫn dùng router cũ (libavoid không route connector về chính shape).
  const routable = edges.filter((e) => e.from !== e.to && boxes.has(e.from) && boxes.has(e.to));
  const routableIds = new Set(routable.map((e) => e.id));
  const result = routeEdges(
    boxes,
    edges.filter((e) => !routableIds.has(e.id)),
  );

  // Connector được đi vào group tổ tiên của hai đầu; group khác là vật cản. libavoid-js không có
  // ClusterRef nên mỗi tập group "được phép" khác nhau chạy một router riêng (không group → 1 router).
  const groups = options.groups ?? [];
  const ancestors = ancestorsOf(groups, options.nodeGroup ?? new Map());
  const batches = new Map<string, { allowed: Set<string>; edges: RouteRequest[] }>();
  for (const edge of routable) {
    const allowed = new Set([...ancestors(edge.from), ...ancestors(edge.to)]);
    const key = [...allowed].sort().join('|');
    if (!batches.has(key)) batches.set(key, { allowed, edges: [] });
    batches.get(key)!.edges.push(edge);
  }
  for (const { allowed, edges: batch } of batches.values()) {
    if (batch.length > MAX_AVOID_EDGES) {
      for (const [id, route] of routeEdges(boxes, batch)) result.set(id, route);
      continue;
    }
    const blocked = groups.filter((g) => !allowed.has(g.id));
    // Node nằm trong group bị chặn đã được khung group che, không cần thêm vào router.
    const nodes = [...boxes].filter(([id]) => !ancestors(id).some((g) => !allowed.has(g)));
    for (const [id, route] of routeBatch(avoid, nodes, blocked, batch, boxes))
      result.set(id, route);
  }
  return order(result, edges);
}

function routeBatch(
  A: Avoid,
  nodes: [string, Box][],
  blocked: AvoidGroup[],
  edges: RouteRequest[],
  boxes: Map<string, Box>,
): Map<string, RouteResult> {
  const result = new Map<string, RouteResult>();
  const router = new A.Router(A.RouterFlag.OrthogonalRouting.value);
  try {
    router.setRoutingParameter(A.RoutingParameter.shapeBufferDistance, SHAPE_BUFFER);
    router.setRoutingParameter(A.RoutingParameter.idealNudgingDistance, NUDGING);
    router.setRoutingParameter(A.RoutingParameter.segmentPenalty, SEGMENT_PENALTY);

    const addShape = (b: Box) => {
      const topLeft = new A.Point(b.x, b.y);
      const bottomRight = new A.Point(b.x + b.width, b.y + b.height);
      const rect = new A.Rectangle(topLeft, bottomRight);
      const shape = new A.ShapeRef(router, rect);
      topLeft.delete();
      bottomRight.delete();
      rect.delete();
      return shape;
    };
    const shapes = new Map<string, ReturnType<typeof addShape>>();
    for (const [id, b] of nodes) {
      const shape = addShape(b);
      new A.ShapeConnectionPin(shape, PIN_CLASS, 0.5, 0.5, true, 0, CONN_DIR_ALL).setExclusive(
        false,
      );
      shapes.set(id, shape);
    }
    for (const g of blocked) addShape(g.box);

    const conns = edges.map((edge) => {
      const src = new A.ConnEnd(shapes.get(edge.from)!, PIN_CLASS);
      const dst = new A.ConnEnd(shapes.get(edge.to)!, PIN_CLASS);
      const conn = new A.ConnRef(router, src, dst);
      src.delete();
      dst.delete();
      if (edge.waypoints?.length) {
        // Điểm gấp người dùng đặt → checkpoint: route orthogonal bắt buộc đi qua từng điểm.
        const checkpoints = new A.CheckpointVector();
        for (const w of edge.waypoints) {
          const point = new A.Point(w.x, w.y);
          const checkpoint = new A.Checkpoint(point);
          checkpoints.push_back(checkpoint);
          point.delete();
          checkpoint.delete();
        }
        conn.setRoutingCheckpoints(checkpoints);
        checkpoints.delete();
      }
      return { edge, conn };
    });

    router.processTransaction();

    for (const { edge, conn } of conns) {
      const line = conn.displayRoute();
      const raw: Point[] = [];
      for (let i = 0; i < line.size(); i++) {
        const p = line.at(i);
        raw.push({ x: p.x, y: p.y });
        p.delete();
      }
      line.delete();
      const points = simplify(clip(raw, boxes.get(edge.from)!, boxes.get(edge.to)!));
      const route: RouteResult = { points };
      if (edge.label) route.label = labelPosition(points, edge.label);
      result.set(edge.id, route);
    }
  } finally {
    // Giải phóng luôn shape, pin, connector của router.
    router.delete();
  }
  return result;
}

/** Hàm trả chuỗi group chứa node (trực tiếp → ngoài cùng); bỏ qua group không có khung. */
function ancestorsOf(groups: AvoidGroup[], nodeGroup: Map<string, string | undefined>) {
  const parent = new Map(groups.map((g) => [g.id, g.parent]));
  const cache = new Map<string, string[]>();
  return (node: string): string[] => {
    const hit = cache.get(node);
    if (hit) return hit;
    const chain: string[] = [];
    for (let g = nodeGroup.get(node); g && parent.has(g) && !chain.includes(g); g = parent.get(g))
      chain.push(g);
    cache.set(node, chain);
    return chain;
  };
}

/** Giữ thứ tự kết quả theo thứ tự `edges` (router cũ và libavoid chạy riêng hai nhóm). */
function order(result: Map<string, RouteResult>, edges: RouteRequest[]): Map<string, RouteResult> {
  const sorted = new Map<string, RouteResult>();
  for (const e of edges) {
    const r = result.get(e.id);
    if (r) sorted.set(e.id, r);
  }
  return sorted;
}

/** Route bắt đầu/kết thúc ở tâm node (pin ở tâm) → cắt về cạnh node. */
function clip(points: Point[], from: Box, to: Box): Point[] {
  if (points.length < 2) return points;
  const head = exit(points, from);
  const tail = exit([...head].reverse(), to).reverse();
  return tail.length >= 2 ? tail : points;
}

/** Bỏ các điểm nằm trong `box` ở đầu đường; điểm đầu mới là giao với biên box. */
function exit(points: Point[], box: Box): Point[] {
  let i = 0;
  while (i + 1 < points.length && inside(points[i + 1]!, box)) i++;
  if (i + 1 >= points.length) return points;
  const a = points[i]!;
  const b = points[i + 1]!;
  const start =
    a.x === b.x
      ? { x: a.x, y: b.y > a.y ? box.y + box.height : box.y }
      : { x: b.x > a.x ? box.x + box.width : box.x, y: a.y };
  return [start, ...points.slice(i + 1)];
}

function inside(p: Point, b: Box): boolean {
  return p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height;
}

/** Làm tròn, bỏ điểm trùng và điểm thẳng hàng giữa hai đoạn cùng phương. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points.map(round)) {
    const prev = out[out.length - 1];
    if (prev && prev.x === p.x && prev.y === p.y) continue;
    const before = out[out.length - 2];
    if (
      prev &&
      before &&
      ((before.x === prev.x && prev.x === p.x) || (before.y === prev.y && prev.y === p.y))
    ) {
      out[out.length - 1] = p;
      continue;
    }
    out.push(p);
  }
  return out;
}

function round(p: Point): Point {
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
}
