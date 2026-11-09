export async function readPhotoBytes(uri: string) {
  const response = await fetch(uri);
  return new Uint8Array(await response.arrayBuffer());
}
