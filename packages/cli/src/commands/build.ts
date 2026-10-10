import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import {
  generateHtml,
  hasErrors,
  layoutView,
  renderSvg,
  resolveView,
  validate,
  type Diagnostic,
} from '@archcode/core';
import { colors, formatSize, printDiagnostics, type Colors } from '../format';

export interface BuildOptions {
  output?: string;
  format: string;
  view?: string;
  force: boolean;
  embedSource: boolean;
  color: boolean;
}

/**
 * Exit code: 0 = đã ghi file, không lỗi · 1 = model có lỗi (kể cả khi --force vẫn ghi file,
 * để CI vẫn fail) · 2 = lỗi sử dụng/đọc file.
 */
export async function buildCommand(file: string, options: BuildOptions): Promise<number> {
  const c = colors(options.color);
  if (options.format !== 'html' && options.format !== 'svg') {
    console.error(`Định dạng "${options.format}" không hỗ trợ; dùng html hoặc svg`);
    return 2;
  }

  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`Không đọc được file "${file}": ${(err as Error).message}`);
    return 2;
  }

  let content: string;
  let diagnostics: Diagnostic[];
  let output: string;

  if (options.format === 'html') {
    const result = await generateHtml(text, { sourceName: file, embedSource: options.embedSource });
    content = result.html;
    diagnostics = result.validation.diagnostics;
    output = options.output ?? replaceExt(file, '.html');
  } else {
    const { model, diagnostics: diags } = validate(text);
    diagnostics = diags;
    if (!model) {
      printDiagnostics([{ file, diagnostics }], c);
      return 1;
    }
    const view = options.view ? model.views.find((v) => v.id === options.view) : model.views[0]!;
    if (!view) {
      console.error(
        `Không có view "${options.view}". View hiện có: ${model.views.map((v) => v.id).join(', ')}`,
      );
      return 2;
    }
    const layout = await layoutView(resolveView(model, view));
    content = renderSvg(layout, { diagnostics, title: view.name });
    output = options.output ?? replaceExt(file, `.${view.id}.svg`);
  }

  printDiagnostics([{ file, diagnostics }], c, { quietWhenClean: true });
  const failed = hasErrors(diagnostics);
  if (failed && !options.force) {
    console.log(c.red('✖ Không ghi file vì model có lỗi (dùng --force để vẫn ghi)'));
    return 1;
  }
  write(output, content, c);
  return failed ? 1 : 0;
}

function write(path: string, content: string, c: Colors) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log(c.green(`✔ Đã ghi ${path} (${formatSize(Buffer.byteLength(content))})`));
}

function replaceExt(file: string, ext: string): string {
  return join(dirname(file), basename(file, extname(file)) + ext);
}
