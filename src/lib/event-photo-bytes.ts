import { File } from 'expo-file-system';

export async function readPhotoBytes(uri: string) {
  const file = new File(uri);
  try { return await file.bytes(); }
  finally { if (file.exists) file.delete(); }
}
