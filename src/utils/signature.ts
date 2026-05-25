/**
 * LINE Webhook署名検証
 */

import * as crypto from 'crypto';

export function validateSignature(
  body: string,
  signature: string,
  channelSecret: string
): boolean {
  const hash = crypto
    .createHmac('sha256', channelSecret)
    .update(body)
    .digest('base64');

  return hash === signature;
}
