/**
 * Thay `libavoid-js` trong bản build Hugo viewer (một file IIFE): Vite sẽ nhúng WASM (LGPL) dạng
 * base64 vào file. Viewer chỉ dùng auto-layout ELK nên không cần libavoid; `loadRouter()` trả
 * `false` và connector dùng router cũ.
 */
export const AvoidLib = {
  load: (): Promise<void> => Promise.reject(new Error('libavoid không có trong Hugo viewer')),
  getInstance: (): never => {
    throw new Error('libavoid không có trong Hugo viewer');
  },
};
