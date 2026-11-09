import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { readPhotoBytes } from './event-photo-bytes';

export const EVENT_PHOTO_BUCKET = 'event-photos';
// The server rejects anything over 4 million pixels; 1600px keeps a 16:9 photo near 1.4 million.
const MAX_EDGE = 1600;
const MAX_BYTES = 5 * 1024 * 1024;
const UNAVAILABLE = 'Event photos aren’t available on this server yet.';

export type PickedEventPhoto = { uri: string; width: number; height: number };

// Resized and re-saved as JPEG on the device, which also converts HEIC.
export async function pickEventPhoto(): Promise<PickedEventPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const context = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width, asset.height);
  if (!longest || longest > MAX_EDGE) context.resize(asset.height > asset.width ? { height: MAX_EDGE } : { width: MAX_EDGE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

async function functionError(error: { context?: Response }) {
  const status = error.context?.status;
  if (status === 404 || status === 503) return UNAVAILABLE;
  try {
    const body = await error.context?.json();
    if (typeof body?.error === 'string') return body.error as string;
  } catch { /* Transport errors have no JSON body. */ }
  return 'Unable to upload the photo. Please try again.';
}

// Uploads through the event-photo Edge Function, which strips metadata and
// attaches the photo to the event. Returns the stored path.
export async function uploadEventPhoto(client: SupabaseClient, eventId: string, photo: PickedEventPhoto) {
  const bytes = await readPhotoBytes(photo.uri);
  if (!bytes.length) throw new Error('Choose another photo.');
  if (bytes.length > MAX_BYTES) throw new Error('Choose a photo smaller than 5 MB.');
  const { data, error } = await client.functions.invoke<{ path?: string; error?: string }>(`event-photo?event=${encodeURIComponent(eventId)}`, {
    body: bytes.slice().buffer as ArrayBuffer,
    headers: { 'Content-Type': 'image/jpeg' },
  });
  if (error) throw new Error(await functionError(error));
  if (data?.error) throw new Error(data.error);
  if (!data?.path) throw new Error('Photo upload did not finish. Please try again.');
  return data.path;
}

export async function removeEventPhoto(client: SupabaseClient, eventId: string) {
  const { error } = await client.rpc('set_event_photo', { p_id: eventId, p_path: null });
  if (error) throw new Error(['42883', 'PGRST202'].includes(error.code) ? UNAVAILABLE : error.message);
}

// Private bucket: requests carry the viewer's session, and the cache key is
// per user so another account on the same device never reuses it.
export function eventPhotoSource(path: string, session: Session) {
  return {
    uri: `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/${EVENT_PHOTO_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`,
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '' },
    cacheKey: `${session.user.id}:${path}`,
  };
}
