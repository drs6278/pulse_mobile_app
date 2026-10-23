import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { MAX_AVATAR_BYTES, type PickedAvatar } from './types';

export async function pickAvatar(): Promise<PickedAvatar | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp'], multiple: false, copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0], file = new File(asset.uri);
  try {
    if ((asset.size ?? file.size) > MAX_AVATAR_BYTES) throw new Error('Choose a photo smaller than 5 MB.');
    const bytes = await file.bytes();
    if (bytes.length > MAX_AVATAR_BYTES) throw new Error('Choose a photo smaller than 5 MB.');
    return { bytes, mime: asset.mimeType ?? 'application/octet-stream', uri: asset.uri, dispose: () => { if (file.exists) file.delete(); } };
  } catch (error) { if (file.exists) file.delete(); throw error; }
}
