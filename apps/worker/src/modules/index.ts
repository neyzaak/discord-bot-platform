import { customcmdModule } from './customcmd';
import { economyModule } from './economy';
import { levelingModule } from './leveling';
import { loggingModule } from './logging';
import { moderationModule } from './moderation';
import { quizModule } from './quiz';
import { ticketsModule } from './tickets';
import { utilitiesModule } from './utilities';
import { welcomeModule } from './welcome';
import type { BotModule } from './types';

export const MODULES: BotModule[] = [
  welcomeModule, moderationModule, ticketsModule, loggingModule,
  utilitiesModule, customcmdModule, levelingModule, economyModule, quizModule,
];
export type { BotModule, CommandContext, ModuleCommand, ModuleCtx } from './types';
