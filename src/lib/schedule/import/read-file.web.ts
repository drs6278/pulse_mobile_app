import { MAX_FILE_BYTES } from '../types';

// Called directly by a button so browser user activation is preserved. The native
// document picker and filesystem are intentionally absent from this module.
export function pickScheduleFile(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.ics,.csv,text/calendar,text/csv';
    input.oncancel = () => resolve(null);
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      if (file.size > MAX_FILE_BYTES) { reject(new Error('File exceeds 2 MiB.')); return; }
      if (!/\.(ics|csv)$/i.test(file.name)) { reject(new Error('Select an .ics or .csv file.')); return; }
      void file.text().then(text => resolve({ name: file.name, text }), reject);
    };
    input.click();
  });
}
