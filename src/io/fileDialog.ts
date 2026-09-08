/**
 * 브라우저 파일 입출력. DOM에 의존하므로 core/ 밖에 둔다.
 *
 * File System Access API를 지원하는 브라우저(Chrome/Edge)에서는 "같은 파일에 덮어쓰기"가
 * 가능하고, 그 외에는 다운로드/업로드로 대체한다. 에디터에서 Ctrl+S를 누를 때마다
 * "level (1).json", "level (2).json"이 쌓이는 걸 막기 위한 구분이다.
 */

interface WritableStreamLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

export interface FileHandleLike {
  readonly name: string;
  createWritable(): Promise<WritableStreamLike>;
  getFile(): Promise<File>;
}

interface FilePickerWindow {
  showSaveFilePicker?: (options: unknown) => Promise<FileHandleLike>;
  showOpenFilePicker?: (options: unknown) => Promise<FileHandleLike[]>;
}

const picker = window as unknown as FilePickerWindow;

export const hasFileSystemAccess = typeof picker.showSaveFilePicker === 'function';

const JSON_TYPES = [{ description: '미로 맵 JSON', accept: { 'application/json': ['.json'] } }];

/** 사용자가 취소하면 던지지 않고 null을 돌려준다. */
function nullOnAbort(err: unknown): null {
  if (err instanceof DOMException && err.name === 'AbortError') return null;
  throw err;
}

export interface SaveResult {
  handle: FileHandleLike | null;
  fileName: string;
}

export async function saveTextAs(
  suggestedName: string,
  text: string,
): Promise<SaveResult | null> {
  if (picker.showSaveFilePicker) {
    try {
      const handle = await picker.showSaveFilePicker({ suggestedName, types: JSON_TYPES });
      await writeHandle(handle, text);
      return { handle, fileName: handle.name };
    } catch (err) {
      return nullOnAbort(err);
    }
  }
  downloadText(suggestedName, text);
  return { handle: null, fileName: suggestedName };
}

export async function writeHandle(handle: FileHandleLike, text: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export interface OpenResult {
  handle: FileHandleLike | null;
  fileName: string;
  text: string;
}

export async function openTextFile(): Promise<OpenResult | null> {
  if (picker.showOpenFilePicker) {
    try {
      const [handle] = await picker.showOpenFilePicker({ types: JSON_TYPES, multiple: false });
      const file = await handle.getFile();
      return { handle, fileName: handle.name, text: await file.text() };
    } catch (err) {
      return nullOnAbort(err);
    }
  }
  return openViaInput();
}

function openViaInput(): Promise<OpenResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve({ handle: null, fileName: file.name, text: await file.text() });
    };
    // 사용자가 파일 선택 창을 그냥 닫으면 change 이벤트가 오지 않는다.
    // 이 경우 Promise가 영원히 대기하므로 창 포커스 복귀를 취소 신호로 쓴다.
    window.addEventListener(
      'focus',
      () => setTimeout(() => resolve(null), 500),
      { once: true },
    );
    input.click();
  });
}
