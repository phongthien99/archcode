import { layoutFileName, parseLayout } from '@archcode/core/canvas';
import { del, get, set } from 'idb-keyval';
import { isDirty, layoutText, useApp, type FsBinding } from '../store';
import { download, readArchitectureFile } from './files';

/**
 * Mở/lưu trực tiếp file trong thư mục repo trên máy (GIT-01) bằng File System Access API.
 * Chỉ Chrome/Edge hỗ trợ; trình duyệt khác dùng tải lên/tải về (`supportsFolders()` = false).
 */

// Kiểu tối thiểu cho phần API chưa có trong lib.dom của TypeScript.
type PermissionMode = { mode: 'read' | 'readwrite' };
interface PermissionHandle {
  queryPermission?(d: PermissionMode): Promise<PermissionState>;
  requestPermission?(d: PermissionMode): Promise<PermissionState>;
}
type DirectoryPicker = (options?: {
  mode?: 'read' | 'readwrite';
  id?: string;
}) => Promise<FileSystemDirectoryHandle>;

export function supportsFolders(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export interface ArchitectureEntry {
  /** Đường dẫn tương đối trong thư mục. */
  path: string;
  file: FileSystemFileHandle;
  dir: FileSystemDirectoryHandle;
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'target', 'vendor']);
const MAX_DEPTH = 4;
const MAX_FILES = 2000;

/** File kiến trúc: `*.yaml`/`*.yml` (trừ file layout) có `version` và `system` ở cấp gốc. */
export function looksLikeArchitecture(name: string, text: string): boolean {
  if (!/\.ya?ml$/i.test(name) || /\.layout\.ya?ml$/i.test(name)) return false;
  return /^version\s*:/m.test(text) && /^system\s*:/m.test(text);
}

export async function listArchitectureFiles(
  root: FileSystemDirectoryHandle,
): Promise<ArchitectureEntry[]> {
  const found: ArchitectureEntry[] = [];
  let seen = 0;
  const walk = async (dir: FileSystemDirectoryHandle, prefix: string, depth: number) => {
    const entries: [string, FileSystemHandle][] = [];
    for await (const entry of (
      dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }
    ).entries()) {
      entries.push(entry);
    }
    entries.sort(([a], [b]) => a.localeCompare(b));
    for (const [name, handle] of entries) {
      if (++seen > MAX_FILES) return;
      if (handle.kind === 'directory') {
        if (depth < MAX_DEPTH && !name.startsWith('.') && !SKIP_DIRS.has(name)) {
          await walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`, depth + 1);
        }
      } else if (/\.ya?ml$/i.test(name) && !/\.layout\.ya?ml$/i.test(name)) {
        const file = await (handle as FileSystemFileHandle).getFile();
        if (file.size > 2_000_000) continue;
        if (looksLikeArchitecture(name, await file.text())) {
          found.push({ path: prefix + name, file: handle as FileSystemFileHandle, dir });
        }
      }
    }
  };
  await walk(root, '', 0);
  return found;
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as unknown as { showDirectoryPicker: DirectoryPicker })
    .showDirectoryPicker;
  const dir = await picker({ mode: 'readwrite', id: 'archcode' });
  await rememberFolder(dir);
  return dir;
}

async function readLayout(
  dir: FileSystemDirectoryHandle,
  fileName: string,
): Promise<string | null> {
  try {
    const handle = await dir.getFileHandle(layoutFileName(fileName));
    return await (await handle.getFile()).text();
  } catch {
    return null;
  }
}

/** Mở một file kiến trúc trong thư mục (kèm file layout cạnh nó nếu có). */
export async function openEntry(entry: ArchitectureEntry): Promise<void> {
  const text = await (await entry.file.getFile()).text();
  const layout = await readLayout(entry.dir, entry.file.name);
  const state = useApp.getState();
  const parsed = layout !== null ? parseLayout(layout, layoutFileName(entry.file.name)) : undefined;
  const fs: FsBinding = {
    dir: entry.dir,
    file: entry.file,
    path: entry.path,
    diskText: text,
    diskLayout: layout,
  };
  state.loadDocument(text, entry.file.name, { layout: parsed?.layout, fs });
  if (parsed?.diagnostics.length) state.notify(parsed.diagnostics[0]!.message, 'info');
}

async function writeFile(handle: FileSystemFileHandle, content: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Ctrl+S: ghi thẳng YAML và file layout vào thư mục (S5-FS-02). Không mở từ thư mục thì tải về.
 * File layout đã được dọn entry của phần tử không còn tồn tại (S5-LAYOUT-06).
 */
export async function save(): Promise<void> {
  const state = useApp.getState();
  const layout = layoutText(state);
  const fs = state.fs;
  if (!fs) {
    download(state.text, state.fileName, 'text/yaml');
    if (layout) download(layout, layoutFileName(state.fileName), 'text/yaml');
    state.markSaved();
    return;
  }
  // Ghi đè thay đổi bên ngoài mà chưa nạp lại → hỏi trước.
  const disk = await (await fs.file.getFile()).text();
  if (
    disk !== fs.diskText &&
    disk !== state.text &&
    !confirm(`"${fs.path}" đã bị thay đổi bên ngoài. Vẫn ghi đè bằng bản đang sửa?`)
  ) {
    return;
  }
  await writeFile(fs.file, state.text);
  let diskLayout = fs.diskLayout;
  if (layout !== undefined || fs.diskLayout !== null) {
    const handle = await fs.dir.getFileHandle(layoutFileName(fs.file.name), { create: true });
    diskLayout = layout ?? 'version: 1\nviews: {}\n';
    await writeFile(handle, diskLayout);
  }
  state.setFs({ ...fs, diskText: state.text, diskLayout });
  state.markSaved();
  state.notify(
    `Đã lưu ${fs.path}${layout !== undefined ? ` và ${layoutFileName(fs.file.name)}` : ''}`,
    'info',
  );
}

/**
 * Quay lại tab: nếu file trên đĩa đã đổi (git pull, editor khác) thì hỏi nạp lại hay giữ bản đang sửa (S5-FS-03).
 * Chưa sửa gì thì nạp lại luôn.
 */
export async function checkExternalChanges(ask: (path: string) => Promise<boolean>): Promise<void> {
  const state = useApp.getState();
  const fs = state.fs;
  if (!fs) return;
  let text: string;
  try {
    text = await (await fs.file.getFile()).text();
  } catch {
    return; // file bị xóa/đổi tên — giữ nguyên bản đang sửa.
  }
  const layout = await readLayout(fs.dir, fs.file.name);
  if (text === fs.diskText && layout === fs.diskLayout) return;
  const dirty = isDirty(state);
  if (dirty && !(await ask(fs.path))) {
    // Giữ bản đang sửa; lần sau chỉ hỏi lại nếu file đổi tiếp.
    state.setFs({ ...fs, diskText: text, diskLayout: layout });
    return;
  }
  const parsed = layout !== null ? parseLayout(layout).layout : undefined;
  state.loadDocument(text, fs.file.name, {
    layout: parsed,
    fs: { ...fs, diskText: text, diskLayout: layout },
  });
  if (!dirty) state.notify(`Đã nạp lại "${fs.path}" vì file thay đổi bên ngoài`, 'info');
}

// --- Thư mục gần đây (S5-FS-04)

const RECENT_KEY = 'archcode:recent-folders';
const RECENT_LIMIT = 5;

export interface RecentFolder {
  name: string;
  handle: FileSystemDirectoryHandle;
  openedAt: number;
}

export async function recentFolders(): Promise<RecentFolder[]> {
  try {
    return (await get<RecentFolder[]>(RECENT_KEY)) ?? [];
  } catch {
    return [];
  }
}

async function rememberFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  const list = await recentFolders();
  const rest: RecentFolder[] = [];
  for (const item of list) {
    const same = await item.handle.isSameEntry(handle).catch(() => false);
    if (!same) rest.push(item);
  }
  const next = [{ name: handle.name, handle, openedAt: Date.now() }, ...rest].slice(
    0,
    RECENT_LIMIT,
  );
  await set(RECENT_KEY, next).catch(() => undefined);
}

export async function forgetFolders(): Promise<void> {
  await del(RECENT_KEY).catch(() => undefined);
}

/** Mở lại thư mục gần đây: trình duyệt hỏi lại quyền (cần thao tác click của người dùng). */
export async function reopenFolder(folder: RecentFolder): Promise<FileSystemDirectoryHandle> {
  const handle = folder.handle as FileSystemDirectoryHandle & PermissionHandle;
  const mode: PermissionMode = { mode: 'readwrite' };
  let permission = (await handle.queryPermission?.(mode)) ?? 'granted';
  if (permission !== 'granted') permission = (await handle.requestPermission?.(mode)) ?? 'denied';
  if (permission !== 'granted')
    throw new Error(`Không được cấp quyền truy cập thư mục "${folder.name}"`);
  await rememberFolder(folder.handle);
  return folder.handle;
}

// --- Fallback cho Firefox/Safari (S5-FS-05)

/** Mở YAML (và file layout nếu chọn kèm) từ input file nhiều lựa chọn. */
export async function readPickedFiles(
  files: File[],
): Promise<{ text: string; fileName: string; layout?: string } | null> {
  const yamlFile =
    files.find((f) => /\.(ya?ml|html?)$/i.test(f.name) && !/\.layout\.ya?ml$/i.test(f.name)) ??
    files[0];
  if (!yamlFile) return null;
  const layoutFile = files.find((f) => f !== yamlFile && /\.layout\.ya?ml$/i.test(f.name));
  const doc = await readArchitectureFile(yamlFile);
  return { ...doc, layout: layoutFile ? await layoutFile.text() : doc.layout };
}
