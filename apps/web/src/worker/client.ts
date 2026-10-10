import { wrap, type Remote } from 'comlink';
import type { AnalyzeResult, CoreWorkerApi } from './api';

/** Toàn bộ core (Ajv, ELK...) chạy trong Worker để UI không bao giờ bị đơ. */
export const core: Remote<CoreWorkerApi> = wrap<CoreWorkerApi>(
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'archcode-core' }),
);

/**
 * Lập lịch phân tích "chỉ lấy bản mới nhất": trong lúc Worker đang bận, các yêu cầu mới
 * chỉ giữ lại yêu cầu cuối cùng; kết quả của yêu cầu cũ không bao giờ ghi đè kết quả mới hơn.
 */
export function createAnalyzer(
  onResult: (r: AnalyzeResult) => void,
  onBusy: (busy: boolean) => void,
) {
  let running = false;
  let pending: { text: string; viewId: string | null } | null = null;

  async function pump() {
    if (running || !pending) return;
    running = true;
    onBusy(true);
    while (pending) {
      const job = pending;
      pending = null;
      try {
        const result = await core.analyze(job.text, job.viewId);
        // Có yêu cầu mới hơn trong lúc chạy → bỏ kết quả này, chạy tiếp bản mới.
        if (!pending) onResult(result);
      } catch (err) {
        console.error('[archcode] Worker lỗi:', err);
      }
    }
    running = false;
    onBusy(false);
  }

  return {
    request(text: string, viewId: string | null) {
      pending = { text, viewId };
      void pump();
    },
  };
}
