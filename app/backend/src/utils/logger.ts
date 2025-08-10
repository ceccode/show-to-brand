import pino from 'pino';

export function createLogger() {
  return pino({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    redact: {
      paths: ['req.headers.authorization', 'OPENAI_API_KEY'],
      remove: true,
    },
    transport: process.env.NODE_ENV === 'production' ? undefined : {
      target: 'pino-pretty',
      options: { colorize: true }
    }
  });
}
