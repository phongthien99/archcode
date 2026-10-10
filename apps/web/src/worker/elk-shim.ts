/// <reference lib="webworker" />
/**
 * elkjs (elk.bundled.js) kiểm tra `typeof document === 'undefined' && typeof self !== 'undefined'`
 * để đoán nó đang chạy trong một Web Worker *dành riêng cho ELK*: khi đó nó chiếm `self.onmessage`
 * thay vì export class FakeWorker → layout hỏng ("o is not a constructor") và phá luồng tin nhắn Comlink.
 *
 * Cách xử lý: tạo `document` giả, khởi tạo một ELK ngay lúc này để elkjs nạp (và cache) phần worker
 * nội bộ theo nhánh FakeWorker, rồi xóa `document` giả. Các instance ELK tạo sau (trong core) dùng lại
 * module đã cache nên chạy đúng ngay trong worker này.
 */
import ELK from 'elkjs/lib/elk.bundled.js';

export function installElkShim(): void {
  const scope = self as unknown as { document?: unknown };
  if ('document' in scope) return;
  scope.document = {};
  try {
    new ELK();
  } finally {
    delete scope.document;
  }
}
