import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { validateCommand } from './commands/validate';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

const program = new Command()
  .name('archcode')
  .description('ArchCode — Architecture as Code: validate và build kiến trúc từ YAML')
  .version(pkg.version, '-v, --version', 'In phiên bản')
  .helpOption('-h, --help', 'Hiển thị trợ giúp')
  .helpCommand('help [command]', 'Hiển thị trợ giúp cho một lệnh');

program
  .command('validate')
  .description('Kiểm tra cú pháp, schema và ngữ nghĩa của file kiến trúc')
  .argument('<files...>', 'Một hoặc nhiều file YAML')
  .option('--strict', 'Coi cảnh báo là lỗi (exit code 1)', false)
  .option('-f, --format <format>', 'Định dạng output: text | json', 'text')
  .option('--no-color', 'Tắt màu')
  .action((files: string[], options) => {
    process.exitCode = validateCommand(files, options);
  });

program.parse();
