import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
export function loadConfig() {
  const env = process.env;
  const secret = env.JWT_SECRET || '';
  if (secret.length < 32 || secret.startsWith('replace-')) throw new Error('Set JWT_SECRET to a random secret of at least 32 characters in server/.env.');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required. Copy server/.env.example to server/.env.');
  const provider = env.AI_PROVIDER || 'demo';
  if (!['demo','gemini'].includes(provider)) throw new Error('AI_PROVIDER must be demo or gemini.');
  if (provider === 'gemini' && !env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required for AI_PROVIDER=gemini.');
  if (env.LOCAL_DOCKER === 'true' && !['http://localhost:3000','http://127.0.0.1:3000'].includes(env.APP_ORIGIN)) throw new Error('LOCAL_DOCKER is only allowed with a localhost APP_ORIGIN.');
  const origin = env.APP_ORIGIN || 'http://localhost:5173';
  if (env.NODE_ENV === 'production' && env.LOCAL_DOCKER !== 'true' && !origin.startsWith('https://')) throw new Error('Production APP_ORIGIN must be the public HTTPS URL.');
  return { secret, provider, origin, production: env.NODE_ENV === 'production', secureCookies: env.NODE_ENV === 'production' && env.LOCAL_DOCKER !== 'true', port: Number(env.PORT || 3000), trustProxy: Number(env.TRUST_PROXY || 0), geminiKey: env.GEMINI_API_KEY, geminiModel: env.GEMINI_MODEL || 'gemini-3.8-flash' };
}
