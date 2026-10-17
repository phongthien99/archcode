import { semantic } from '@archcode/core/tokens';
import { core } from '../worker/client';

export function download(content: BlobPart, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function baseName(fileName: string): string {
  return fileName.replace(/\.(ya?ml|html?)$/i, '');
}

/** Đọc file người dùng chọn: YAML trả nguyên văn; HTML export của ArchCode trả YAML đã nhúng. */
export async function readArchitectureFile(
  file: File,
): Promise<{ text: string; fileName: string; layout?: string }> {
  const content = await file.text();
  // Nhận diện theo cả nội dung: file tải về/đổi tên có thể mất đuôi .html.
  if (/\.html?$/i.test(file.name) || /^\s*<(!doctype html|html)[\s>]/i.test(content)) {
    const embedded = await core.extractEmbeddedSource(content);
    if (!embedded) {
      throw new Error(
        'File HTML này không chứa YAML nhúng (không phải export của ArchCode, hoặc xuất với --no-embed-source).',
      );
    }
    // Ưu tiên tên file YAML gốc lưu lúc xuất (bỏ phần thư mục nếu xuất từ CLI).
    const original = embedded.name?.split(/[\\/]/).pop();
    return {
      text: embedded.text,
      fileName: original || `${baseName(file.name)}.yaml`,
      layout: embedded.layout?.text,
    };
  }
  return { text: content, fileName: file.name };
}

/** SVG → PNG độ phân giải 2x, nền trắng. */
export async function svgToPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = semantic.light.surface;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được PNG'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
