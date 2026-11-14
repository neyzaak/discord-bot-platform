import { env, logger } from '@platform/core';
import app from './app';

app.listen(env.API_PORT, () => logger.info(`API siap di :${env.API_PORT}`));
