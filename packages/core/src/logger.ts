import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'token', '*.token', '*.tokenEncrypted', '*.token_encrypted',
      'authorization', '*.authorization', 'req.headers.authorization', '*.password',
    ],
    censor: '[REDACTED]',
  },
});
