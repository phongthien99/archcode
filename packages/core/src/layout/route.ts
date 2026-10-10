/**
 * Router orthogonal đơn giản cho layout thủ công (vị trí node do người dùng kéo).
 * Thuần hàm, không phụ thuộc ELK: dùng chung cho canvas (tính lại mỗi khung hình khi kéo)
 * và cho SVG/HTML xuất ra, nên hai nơi luôn vẽ connector giống hệt nhau.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RouteRequest {
  id: string;
  from: string;
  to: string;
  /** Kích thước nhãn (nếu có) để đặt nhãn giữa đường. */
  label?: { width: number; height: number };
  /** Điểm gấp do người dùng khai báo trong file layout. */
  waypoints?: Point[];
}

export interface RouteResult {
  points: Point[];
  /** Góc trên trái của nhãn. */
  label?: Point;
}

type Side = 'left' | 'right' | 'top' | 'bottom';

interface Port {
  edge: string;
  node: string;
  side: Side;
  /** Đầu còn lại — để sắp thứ tự các cổng trên cùng một cạnh, tránh connector cắt nhau. */
  other: Point;
  order: number;
  point?: Point;
}

const center = (b: Box): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** Khoảng hở giữa hai box theo từng trục (âm = chồng lên nhau). */
function gaps(a: Box, b: Box) {
  return {
    x: Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width)),
    y: Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height)),
  };
}

function sidesFor(a: Box, b: Box): [Side, Side] {
  const ca = center(a);
  const cb = center(b);
  const g = gaps(a, b);
  if (g.x >= g.y) return cb.x >= ca.x ? ['right', 'left'] : ['left', 'right'];
  return cb.y >= ca.y ? ['bottom', 'top'] : ['top', 'bottom'];
}

/** Điểm trên cạnh `side` của box, tại vị trí `t` (0..1) dọc theo cạnh. */
function onSide(b: Box, side: Side, t: number): Point {
  switch (side) {
    case 'left':
      return { x: b.x, y: b.y + b.height * t };
    case 'right':
      return { x: b.x + b.width, y: b.y + b.height * t };
    case 'top':
      return { x: b.x + b.width * t, y: b.y };
    case 'bottom':
      return { x: b.x + b.width * t, y: b.y + b.height };
  }
}

/** Trải đều các cổng trên một cạnh (trong khoảng giữa 20%–80% của cạnh). */
function assignPorts(ports: Port[], boxes: Map<string, Box>) {
  const bySide = new Map<string, Port[]>();
  for (const port of ports) {
    const key = `${port.node}|${port.side}`;
    if (!bySide.has(key)) bySide.set(key, []);
    bySide.get(key)!.push(port);
  }
  for (const group of bySide.values()) {
    const vertical = group[0]!.side === 'left' || group[0]!.side === 'right';
    group.sort(
      (a, b) => (vertical ? a.other.y - b.other.y : a.other.x - b.other.x) || a.order - b.order,
    );
    const box = boxes.get(group[0]!.node)!;
    group.forEach((port, i) => {
      const t = group.length === 1 ? 0.5 : 0.2 + (0.6 * i) / (group.length - 1);
      port.point = round(onSide(box, port.side, t));
    });
  }
}

/** Định tuyến mọi connector. Kết quả deterministic: cùng vị trí node → cùng đường đi. */
export function routeEdges(
  boxes: Map<string, Box>,
  edges: RouteRequest[],
): Map<string, RouteResult> {
  const result = new Map<string, RouteResult>();
  const ports: Port[] = [];
  const plans: { edge: RouteRequest; start?: Port; end?: Port }[] = [];

  edges.forEach((edge, order) => {
    const a = boxes.get(edge.from);
    const b = boxes.get(edge.to);
    if (!a || !b) return;
    if (edge.from === edge.to) {
      plans.push({ edge });
      return;
    }
    // Có điểm gấp: chọn cạnh theo điểm gấp đầu/cuối thay vì theo node bên kia.
    const firstTarget = edge.waypoints?.length ? pointBox(edge.waypoints[0]!) : b;
    const lastSource = edge.waypoints?.length
      ? pointBox(edge.waypoints[edge.waypoints.length - 1]!)
      : a;
    const [sa] = sidesFor(a, firstTarget);
    const [, sb] = sidesFor(lastSource, b);
    const start: Port = {
      edge: edge.id,
      node: edge.from,
      side: sa,
      other: center(firstTarget),
      order,
    };
    const end: Port = { edge: edge.id, node: edge.to, side: sb, other: center(lastSource), order };
    ports.push(start, end);
    plans.push({ edge, start, end });
  });
  assignPorts(ports, boxes);

  for (const { edge, start, end } of plans) {
    let points: Point[];
    if (!start || !end) {
      points = selfLoop(boxes.get(edge.from)!);
    } else if (edge.waypoints?.length) {
      points = [start.point!, ...edge.waypoints.map(round), end.point!];
    } else {
      points = orthogonal(
        start.point!,
        start.side,
        end.point!,
        boxes.get(edge.from)!,
        boxes.get(edge.to)!,
      );
    }
    const route: RouteResult = { points };
    if (edge.label) {
      const mid = midpoint(points);
      route.label = round({ x: mid.x - edge.label.width / 2, y: mid.y - edge.label.height / 2 });
    }
    result.set(edge.id, route);
  }
  return result;
}

function pointBox(p: Point): Box {
  return { x: p.x, y: p.y, width: 0, height: 0 };
}

function orthogonal(start: Point, side: Side, end: Point, a: Box, b: Box): Point[] {
  const g = gaps(a, b);
  // Hai box chồng lên nhau: nối thẳng.
  if (g.x < 0 && g.y < 0) return [start, end];
  const horizontal = side === 'left' || side === 'right';
  if (horizontal) {
    if (Math.abs(start.y - end.y) < 1) return [start, { x: end.x, y: start.y }];
    const midX = round1((start.x + end.x) / 2);
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }
  if (Math.abs(start.x - end.x) < 1) return [start, { x: start.x, y: end.y }];
  const midY = round1((start.y + end.y) / 2);
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}

function selfLoop(b: Box): Point[] {
  const r = round({ x: b.x + b.width, y: b.y + b.height * 0.3 });
  const t = round({ x: b.x + b.width * 0.7, y: b.y });
  return [r, { x: r.x + 24, y: r.y }, { x: r.x + 24, y: t.y - 24 }, { x: t.x, y: t.y - 24 }, t];
}

/** Điểm giữa đường gấp khúc theo chiều dài. */
function midpoint(points: Point[]): Point {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
  let remaining = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]! || i === lengths.length - 1) {
      const t = lengths[i] ? remaining / lengths[i]! : 0;
      const a = points[i]!;
      const b = points[i + 1]!;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= lengths[i]!;
  }
  return points[0]!;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round(p: Point): Point {
  return { x: round1(p.x), y: round1(p.y) };
}
