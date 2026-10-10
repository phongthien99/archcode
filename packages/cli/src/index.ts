import { Command } from 'commander';
import pkg from '../package.json' with { type: 'json' };
import { buildCommand } from './commands/build';
import { validateCommand } from './commands/validate';

const program = new Command()
  .name('archcode')
  .description('ArchCode — Architecture as Code: validate và build kiến trúc từ YAML')
  .version(pkg.version, '-v, --version', 'In phiên bản')
  .helpOption('-h, --help', 'Hiển thị trợ giúp')
  .helpCommand('help [command]', 'Hiển thị trợ giúp cho một lệnh');

program
  .command('validate')
  .description('Kiểm tra cú pháp, schema, ngữ nghĩa và rule kiến trúc')
  .argument('<files...>', 'Một hoặc nhiều file YAML')
  .option('--strict', 'Coi cảnh báo là lỗi (exit code 1)', false)
  .option('-f, --format <format>', 'Định dạng output: text | json', 'text')
  .option('--no-color', 'Tắt màu')
  .action((files: string[], options) => {
    process.exitCode = validateCommand(files, options);
  });

program
  .command('build')
  .description('Sinh tài liệu HTML tự chứa (hoặc SVG của một view) từ file kiến trúc')
  .argument('<file>', 'File YAML')
  .option('-o, --output <path>', 'File đầu ra (mặc định: cạnh file YAML)')
  .option('-f, --format <format>', 'html | svg', 'html')
  .option('--view <id>', 'View cần xuất khi --format svg (mặc định: view đầu tiên)')
  .option('--force', 'Vẫn ghi file khi model có lỗi (exit code vẫn là 1)', false)
  .option('--no-embed-source', 'Không nhúng YAML gốc vào HTML')
  .option('--layout <path>', 'File layout (mặc định: <tên>.layout.yaml cạnh file YAML, nếu có)')
  .option('--auto-layout', 'Bỏ qua file layout, luôn tự sắp xếp', false)
  .option('--no-color', 'Tắt màu')
  .action(async (file: string, options) => {
    process.exitCode = await buildCommand(file, options);
  });

await program.parseAsync();
