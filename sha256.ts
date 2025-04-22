import crypto from 'node:crypto';

export async function sha256(input: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', input);

  return new Uint8Array(hash);
}
