import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { MAX_FILE_BYTES } from '../types';

export async function pickScheduleFile(): Promise<{ name: string; text: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const file = new File(asset.uri);
  try {
    if ((asset.size ?? file.size) > MAX_FILE_BYTES) throw new Error('File exceeds 2 MiB.');
    if (!/\.(ics|csv)$/i.test(asset.name)) throw new Error('Select an .ics or .csv file.');
    return { name: asset.name, text: await file.text() };
  } finally { if (file.exists) file.delete(); }
}
