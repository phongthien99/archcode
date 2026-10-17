/**
 * Type tối thiểu cho libavoid-js 0.5.0-beta.5: `exports.types` của package trỏ tới file không tồn tại,
 * typings đi kèm cũng lệch với binding embind thật. Chỉ khai báo phần core dùng; `avoid.ts` ép kiểu
 * export của package về `AvoidLibApi`.
 * Mọi object tạo bằng `new` phải `.delete()` (bộ nhớ WASM); `Router.delete()` giải phóng luôn
 * shape, pin và connector thuộc về nó.
 */
export interface Deletable {
  delete(): void;
}
export interface EnumValue {
  value: number;
}
/**
 * Giá trị enum embind. Hàm nhận enum phải được truyền chính object này, KHÔNG truyền `.value`:
 * truyền số thì mọi lời gọi `setRoutingParameter` đều ghi vào tham số đầu tiên (`segmentPenalty`).
 */
export interface EnumObject extends EnumValue {
  readonly __enum: unique symbol;
}
export interface AvoidPoint extends Deletable {
  x: number;
  y: number;
}
export interface AvoidPolyLine extends Deletable {
  size(): number;
  at(index: number): AvoidPoint;
}
export interface AvoidRouter extends Deletable {
  processTransaction(): void;
  setRoutingParameter(parameter: EnumObject, value: number): void;
  setRoutingOption(option: EnumObject, value: boolean): void;
}
export interface AvoidShapeRef {
  readonly __shape: unique symbol;
}
export interface AvoidConnEnd extends Deletable {
  readonly __connEnd: unique symbol;
}
export interface AvoidConnRef {
  displayRoute(): AvoidPolyLine;
  setRoutingCheckpoints(checkpoints: AvoidCheckpointVector): void;
}
export interface AvoidCheckpoint extends Deletable {
  readonly __checkpoint: unique symbol;
}
export interface AvoidCheckpointVector extends Deletable {
  push_back(checkpoint: AvoidCheckpoint): void;
}
export interface AvoidPin {
  setExclusive(exclusive: boolean): void;
}

export interface Avoid {
  Point: new (x: number, y: number) => AvoidPoint;
  Rectangle: new (topLeft: AvoidPoint, bottomRight: AvoidPoint) => Deletable;
  Router: new (flags: number) => AvoidRouter;
  ShapeRef: new (router: AvoidRouter, polygon: Deletable) => AvoidShapeRef;
  ShapeConnectionPin: new (
    shape: AvoidShapeRef,
    classId: number,
    xOffset: number,
    yOffset: number,
    proportional: boolean,
    insideOffset: number,
    visDirs: number,
  ) => AvoidPin;
  ConnEnd: new (shape: AvoidShapeRef, classId: number) => AvoidConnEnd;
  ConnRef: new (router: AvoidRouter, src: AvoidConnEnd, dst: AvoidConnEnd) => AvoidConnRef;
  Checkpoint: new (point: AvoidPoint) => AvoidCheckpoint;
  CheckpointVector: new () => AvoidCheckpointVector;
  RouterFlag: { OrthogonalRouting: EnumValue };
  RoutingParameter: {
    segmentPenalty: EnumObject;
    shapeBufferDistance: EnumObject;
    idealNudgingDistance: EnumObject;
  };
  RoutingOption: { nudgeOrthogonalSegmentsConnectedToShapes: EnumObject };
}

export interface AvoidLibApi {
  load(wasmUrl?: string): Promise<void>;
  getInstance(): Avoid;
}
