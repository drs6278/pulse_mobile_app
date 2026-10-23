import * as DocumentPicker from 'expo-document-picker';
import { MAX_AVATAR_BYTES, type PickedAvatar } from './types';

export async function pickAvatar(): Promise<PickedAvatar | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp'], multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if ((asset.size ?? 0) > MAX_AVATAR_BYTES) throw new Error('Choose a photo smaller than 5 MB.');
  const blob = asset.file ?? await (await fetch(asset.uri)).blob();
  if (blob.size > MAX_AVATAR_BYTES) throw new Error('Choose a photo smaller than 5 MB.');
  const uri = URL.createObjectURL(blob);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type, uri, dispose: () => URL.revokeObjectURL(uri) };
}
