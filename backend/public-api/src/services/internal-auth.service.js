import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { env } from '../config/env.js';

const getSigningSecret = () => {
  const secret = env.internalAuthSharedSecrets[0];
  if (!secret) throw new Error('INTERNAL_AUTH_SHARED_SECRETS vide.');
  return new TextEncoder().encode(secret);
};

export const mintInternalToken = async ({ userSub, requestId, scope = 'orchestrate:invoke' }) => {
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(30, env.internalAuthTtlSec);
  const secret = getSigningSecret();

  return new SignJWT({
    scope,
    request_id: requestId,
  })
    .setProtectedHeader({ alg: 'HS256', kid: env.internalAuthKid, typ: 'JWT' })
    .setIssuer(env.internalAuthIssuer)
    .setAudience(env.internalAuthAudience)
    .setSubject(userSub || 'anonymous')
    .setIssuedAt(now)
    .setJti(randomUUID())
    .setExpirationTime(now + ttl)
    .sign(secret);
};
