'use client';

import { useI18n } from '../lib/i18n';

export interface Opt { id: string; name: string; type?: number }
export interface CustomEntry { name: string; response: string; embed: boolean }
export interface QuizQuestion { question: string; choices: string[]; correctIndex: number; explanation: string }
export interface GuildConfigData {
  welcome: { enabled: boolean; channelId: string; message: string; dmEnabled: boolean; dmMessage: string; autoRoleId: string };
  moderation: { enabled: boolean; moderatorRoleId: string; modLogChannelId: string };
  tickets: { enabled: boolean; categoryId: string; staffRoleId: string; transcriptChannelId: string; maxOpenPerUser: number };
  logging: { enabled: boolean; channelId: string; logMessageDelete: boolean; logMessageEdit: boolean; logMemberJoin: boolean; logMemberLeave: boolean; logRoleChange: boolean };
  utilities: { enabled: boolean };
  customcmd: { enabled: boolean; commands: CustomEntry[] };
  leveling: { enabled: boolean; xpMin: number; xpMax: number; cooldownSec: number; announceChannelId: string; levelUpMessage: string; roleRewards: Array<{ level: number; roleId: string }> };
  economy: { enabled: boolean; currencyName: string; dailyAmount: number; workMin: number; workMax: number; workCooldownSec: number; shop: Array<{ name: string; price: number; roleId: string }> };
  webhooks: { enabled: boolean };
  quiz: { enabled: boolean; title: string; pointsName: string; timePerQuestionSec: number; pointsPerQuestion: number; questionsPerSession: number; questions: QuizQuestion[] };
}

const inputCls = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-400';
const labelCls = 'mb-1 block text-sm text-slate-300';

export function Select({ value, onChange, options, noneLabel }: {
  value: string; onChange: (v: string) => void; options: Opt[]; noneLabel: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">{noneLabel}</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Num({ value, onChange, min, max, w = 'max-w-[120px]' }: {
  value: number; onChange: (v: number) => void; min: number; max: number; w?: string;
}) {
  return (
    <input type="number" min={min} max={max} value={value}
      onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
      className={`${inputCls} ${w}`} />
  );
}

export function GuildConfigPanel({ cfg, channels, roles, onChange }: {
  cfg: GuildConfigData; channels: Opt[]; roles: Opt[]; onChange: (next: GuildConfigData) => void;
}) {
  const { t } = useI18n();
  const textChannels = channels.filter((c) => c.type !== 4);
  const categories = channels.filter((c) => c.type === 4);
  const set = <K extends keyof GuildConfigData>(k: K, v: GuildConfigData[K]) => onChange({ ...cfg, [k]: v });

  return (
    <div className="space-y-5">
      {/* Selamat Datang */}
      <div className="rounded-xl border border-slate-800 p-4">
        <h3 className="mb-3 font-medium">{t('mod.welcome')}</h3>
        <p className="mb-3 text-xs text-slate-500">{t('mod.welcome.commands')}</p>
        <div className="mb-3"><Check label={t('mod.welcome.enabled')} checked={cfg.welcome.enabled} onChange={(v) => set('welcome', { ...cfg.welcome, enabled: v })} /></div>
        <div className="mb-3">
          <label className={labelCls}>{t('mod.welcome.channel')}</label>
          <Select value={cfg.welcome.channelId} onChange={(v) => set('welcome', { ...cfg.welcome, channelId: v })} options={textChannels} noneLabel={t('common.none')} />
        </div>
        <div className="mb-3">
          <label className={labelCls}>{t('mod.welcome.message')}</label>
          <textarea value={cfg.welcome.message} maxLength={1000} rows={2}
            onChange={(e) => set('welcome', { ...cfg.welcome, message: e.target.value })} className={inputCls} />
          <p className="mt-1 text-xs text-slate-500">{t('mod.welcome.messageHint')}</p>
        </div>
        <div className="mb-3"><Check label={t('mod.welcome.dm')} checked={cfg.welcome.dmEnabled} onChange={(v) => set('welcome', { ...cfg.welcome, dmEnabled: v })} /></div>
        {cfg.welcome.dmEnabled && (
          <div className="mb-3">
            <label className={labelCls}>{t('mod.welcome.dmMessage')}</label>
            <textarea value={cfg.welcome.dmMessage} maxLength={1000} rows={2}
              onChange={(e) => set('welcome', { ...cfg.welcome, dmMessage: e.target.value })} className={inputCls} />
          </div>
        )}
        <label className={labelCls}>{t('mod.welcome.autoRole')}</label>
        <Select value={cfg.welcome.autoRoleId} onChange={(v) => set('welcome', { ...cfg.welcome, autoRoleId: v })} options={roles} noneLabel={t('common.none')} />
      </div>

      {/* Moderasi */}
      <div className="rounded-xl border border-slate-800 p-4">
        <h3 className="mb-3 font-medium">{t('mod.moderation')}</h3>
        <p className="mb-3 text-xs text-slate-500">{t('mod.moderation.commands')}</p>
        <div className="mb-3">
          <label className={labelCls}>{t('mod.moderation.modLog')}</label>
          <Select value={cfg.moderation.modLogChannelId} onChange={(v) => set('moderation', { ...cfg.moderation, modLogChannelId: v })} options={textChannels} noneLabel={t('common.none')} />
        </div>
        <label className={labelCls}>{t('mod.moderation.modRole')}</label>
        <Select value={cfg.moderation.moderatorRoleId} onChange={(v) => set('moderation', { ...cfg.moderation, moderatorRoleId: v })} options={roles} noneLabel={t('common.none')} />
      </div>

      {/* Tiket */}
      <div className="rounded-xl border border-slate-800 p-4">
        <h3 className="mb-3 font-medium">{t('mod.tickets')}</h3>
        <p className="mb-3 text-xs text-slate-500">{t('mod.tickets.commands')}</p>
        <div className="mb-3"><Check label={t('mod.enabled')} checked={cfg.tickets.enabled} onChange={(v) => set('tickets', { ...cfg.tickets, enabled: v })} /></div>
        <div className="mb-3">
          <label className={labelCls}>{t('mod.tickets.category')}</label>
          <Select value={cfg.tickets.categoryId} onChange={(v) => set('tickets', { ...cfg.tickets, categoryId: v })} options={categories} noneLabel={t('common.none')} />
        </div>
        <div className="mb-3">
          <label className={labelCls}>{t('mod.tickets.staffRole')}</label>
          <Select value={cfg.tickets.staffRoleId} onChange={(v) => set('tickets', { ...cfg.tickets, staffRoleId: v })} options={roles} noneLabel={t('common.none')} />
        </div>
        <div className="mb-3">
          <label className={labelCls}>{t('mod.tickets.transcript')}</label>
          <Select value={cfg.tickets.transcriptChannelId} onChange={(v) => set('tickets', { ...cfg.tickets, transcriptChannelId: v })} options={textChannels} noneLabel={t('common.none')} />
        </div>
        <label className={labelCls}>{t('mod.tickets.maxOpen')}</label>
        <Num value={cfg.tickets.maxOpenPerUser} min={1} max={5} onChange={(v) => set('tickets', { ...cfg.tickets, maxOpenPerUser: v })} />
      </div>

      {/* Logging */}
      <div className="rounded-xl border border-slate-800 p-4">
        <h3 className="mb-3 font-medium">{t('mod.logging')}</h3>
        <p className="mb-3 text-xs text-slate-500">{t('mod.logging.commands')}</p>
        <div className="mb-3">
          <label className={labelCls}>{t('mod.logging.channel')}</label>
          <Select value={cfg.logging.channelId} onChange={(v) => set('logging', { ...cfg.logging, channelId: v })} options={textChannels} noneLabel={t('common.none')} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Check label={t('mod.logging.delete')} checked={cfg.logging.logMessageDelete} onChange={(v) => set('logging', { ...cfg.logging, logMessageDelete: v })} />
          <Check label={t('mod.logging.edit')} checked={cfg.logging.logMessageEdit} onChange={(v) => set('logging', { ...cfg.logging, logMessageEdit: v })} />
          <Check label={t('mod.logging.join')} checked={cfg.logging.logMemberJoin} onChange={(v) => set('logging', { ...cfg.logging, logMemberJoin: v })} />
          <Check label={t('mod.logging.leave')} checked={cfg.logging.logMemberLeave} onChange={(v) => set('logging', { ...cfg.logging, logMemberLeave: v })} />
          <Check label={t('mod.logging.roles')} checked={cfg.logging.logRoleChange} onChange={(v) => set('logging', { ...cfg.logging, logRoleChange: v })} />
        </div>
      </div>

      {/* Utilitas */}
      <div className="rounded-xl border border-slate-800 p-4">
        <h3 className="mb-3 font-medium">{t('mod.utilities')}</h3>
        <p className="mb-3 text-xs text-slate-500">{t('mod.utilities.commands')}</p>
        <Check label={t('mod.enabled')} checked={cfg.utilities.enabled} onChange={(v) => set('utilities', { enabled: v })} />
      </div>

      {/* Custom Command */}
      <div className="rounded-xl border border-slate-800 p-4">
        <h3 className="mb-3 font-medium">{t('mod.customcmd')}</h3>
        <p className="mb-3 text-xs text-slate-500">{t('mod.customcmd.commands')}</p>
        <div className="mb-3"><Check label={t('mod.enabled')} checked={cfg.customcmd.enabled} onChange={(v) => set('customcmd', { ...cfg.customcmd, enabled: v })} /></div>
        <div className="space-y-3">
          {cfg.customcmd.commands.map((c, i) => (
            <div key={i} className="rounded-lg border border-slate-800 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm text-slate-500">!</span>
                <input value={c.name} maxLength={32}
                  onChange={(e) => {
                    const cmds = [...cfg.customcmd.commands];
                    cmds[i] = { ...c, name: e.target.value.toLowerCase() };
                    set('customcmd', { ...cfg.customcmd, commands: cmds });
                  }}
                  className={`${inputCls} max-w-[200px] font-mono`} />
                <Check label={t('mod.customcmd.embed')} checked={c.embed}
                  onChange={(v) => {
                    const cmds = [...cfg.customcmd.commands];
                    cmds[i] = { ...c, embed: v };
                    set('customcmd', { ...cfg.customcmd, commands: cmds });
                  }} />
                <button type="button" onClick={() => set('customcmd', { ...cfg.customcmd, commands: cfg.customcmd.commands.filter((_, j) => j !== i) })}
                  className="ml-auto text-xs text-rose-400 hover:text-rose-300">{t('mod.customcmd.remove')}</button>
              </div>
              <textarea value={c.response} maxLength={1000} rows={2}
                onChange={(e) => {
                  const cmds = [...cfg.customcmd.commands];
                  cmds[i] = { ...c, response: e.target.value };
                  set('customcmd', { ...cfg.customcmd, commands: cmds });
                }}
                className={inputCls} />
            </div>
          ))}
        </div>
        {cfg.customcmd.commands.length < 25 && (
          <button type="button"
            onClick={() => set('customcmd', { ...cfg.customcmd, commands: [...cfg.customcmd.commands, { name: '', response: '', embed: false }] })}
            className="mt-3 rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:border-slate-500">
            + {t('mod.customcmd.add')}
          </button>
        )}
      </div>

      {/* Leveling */}
      <div className="rounded-xl border border-slate-800 p-4">
        <h3 className="mb-3 font-medium">{t('mod.leveling')}</h3>
        <p className="mb-3 text-xs text-slate-500">{t('mod.leveling.commands')}</p>
        <div className="mb-3"><Check label={t('mod.enabled')} checked={cfg.leveling.enabled} onChange={(v) => set('leveling', { ...cfg.leveling, enabled: v })} /></div>
        <div className="mb-3 grid grid-cols-3 gap-3">
          <div><label className={labelCls}>{t('mod.leveling.xpMin')}</label><Num value={cfg.leveling.xpMin} min={1} max={50} onChange={(v) => set('leveling', { ...cfg.leveling, xpMin: v })} /></div>
          <div><label className={labelCls}>{t('mod.leveling.xpMax')}</label><Num value={cfg.leveling.xpMax} min={1} max={50} onChange={(v) => set('leveling', { ...cfg.leveling, xpMax: v })} /></div>
          <div><label className={labelCls}>{t('mod.leveling.cooldown')}</label><Num value={cfg.leveling.cooldownSec} min={0} max={600} onChange={(v) => set('leveling', { ...cfg.leveling, cooldownSec: v })} /></div>
        </div>
        <div className="mb-3">
          <label className={labelCls}>{t('mod.leveling.announce')}</label>
          <Select value={cfg.leveling.announceChannelId} onChange={(v) => set('leveling', { ...cfg.leveling, announceChannelId: v })} options={textChannels} noneLabel={t('common.none')} />
        </div>
        <div className="mb-3">
          <label className={labelCls}>{t('mod.leveling.message')}</label>
          <textarea value={cfg.leveling.levelUpMessage} maxLength={500} rows={2}
            onChange={(e) => set('leveling', { ...cfg.leveling, levelUpMessage: e.target.value })} className={inputCls} />
          <p className="mt-1 text-xs text-slate-500">{t('mod.leveling.messageHint')}</p>
        </div>
        <label className={labelCls}>{t('mod.leveling.rewards')}</label>
        <div className="space-y-2">
          {cfg.leveling.roleRewards.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Lv</span>
              <Num value={r.level} min={1} max={500} w="w-24" onChange={(v) => {
                const rr = [...cfg.leveling.roleRewards];
                rr[i] = { ...r, level: v };
                set('leveling', { ...cfg.leveling, roleRewards: rr });
              }} />
              <Select value={r.roleId} onChange={(v) => {
                const rr = [...cfg.leveling.roleRewards];
                rr[i] = { ...r, roleId: v };
                set('leveling', { ...cfg.leveling, roleRewards: rr });
              }} options={roles} noneLabel={t('common.select')} />
              <button type="button" onClick={() => set('leveling', { ...cfg.leveling, roleRewards: cfg.leveling.roleRewards.filter((_, j) => j !== i) })}
                className="text-xs text-rose-400 hover:text-rose-300">{t('mod.customcmd.remove')}</button>
            </div>
          ))}
        </div>
        {cfg.leveling.roleRewards.length < 20 && roles.length > 0 && (
          <button type="button"
            onClick={() => set('leveling', { ...cfg.leveling, roleRewards: [...cfg.leveling.roleRewards, { level: 10, roleId: roles[0].id }] })}
            className="mt-2 rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:border-slate-500">
            + {t('mod.leveling.rewardsAdd')}
          </button>
        )}
      </div>

      {/* Ekonomi */}
      <div className="rounded-xl border border-slate-800 p-4">
        <h3 className="mb-3 font-medium">{t('mod.economy')}</h3>
        <p className="mb-3 text-xs text-slate-500">{t('mod.economy.commands')}</p>
        <div className="mb-3"><Check label={t('mod.enabled')} checked={cfg.economy.enabled} onChange={(v) => set('economy', { ...cfg.economy, enabled: v })} /></div>
        <div className="mb-3">
          <label className={labelCls}>{t('mod.economy.currency')}</label>
          <input value={cfg.economy.currencyName} maxLength={16}
            onChange={(e) => set('economy', { ...cfg.economy, currencyName: e.target.value })} className={`${inputCls} max-w-[200px]`} />
        </div>
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><label className={labelCls}>{t('mod.economy.daily')}</label><Num value={cfg.economy.dailyAmount} min={1} max={100000} onChange={(v) => set('economy', { ...cfg.economy, dailyAmount: v })} /></div>
          <div><label className={labelCls}>{t('mod.economy.workMin')}</label><Num value={cfg.economy.workMin} min={1} max={10000} onChange={(v) => set('economy', { ...cfg.economy, workMin: v })} /></div>
          <div><label className={labelCls}>{t('mod.economy.workMax')}</label><Num value={cfg.economy.workMax} min={1} max={10000} onChange={(v) => set('economy', { ...cfg.economy, workMax: v })} /></div>
          <div><label className={labelCls}>{t('mod.economy.workCooldown')}</label><Num value={cfg.economy.workCooldownSec} min={60} max={86400} onChange={(v) => set('economy', { ...cfg.economy, workCooldownSec: v })} /></div>
        </div>
        <label className={labelCls}>{t('mod.economy.shop')}</label>
        <div className="space-y-2">
          {cfg.economy.shop.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={it.name} maxLength={32} placeholder={t('mod.economy.itemName')}
                onChange={(e) => {
                  const shop = [...cfg.economy.shop];
                  shop[i] = { ...it, name: e.target.value };
                  set('economy', { ...cfg.economy, shop });
                }}
                className={`${inputCls} max-w-[180px]`} />
              <Num value={it.price} min={1} max={1000000} w="w-28" onChange={(v) => {
                const shop = [...cfg.economy.shop];
                shop[i] = { ...it, price: v };
                set('economy', { ...cfg.economy, shop });
              }} />
              <Select value={it.roleId} onChange={(v) => {
                const shop = [...cfg.economy.shop];
                shop[i] = { ...it, roleId: v };
                set('economy', { ...cfg.economy, shop });
              }} options={roles} noneLabel={t('common.select')} />
              <button type="button" onClick={() => set('economy', { ...cfg.economy, shop: cfg.economy.shop.filter((_, j) => j !== i) })}
                className="text-xs text-rose-400 hover:text-rose-300">{t('mod.customcmd.remove')}</button>
            </div>
          ))}
        </div>
        {cfg.economy.shop.length < 10 && roles.length > 0 && (
          <button type="button"
            onClick={() => set('economy', { ...cfg.economy, shop: [...cfg.economy.shop, { name: '', price: 100, roleId: roles[0].id }] })}
            className="mt-2 rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:border-slate-500">
            + {t('mod.economy.shopAdd')}
          </button>
        )}
      </div>

      {/* Webhooks */}
      <div className="rounded-xl border border-slate-800 p-4">
        <h3 className="mb-3 font-medium">{t('mod.webhooks')}</h3>
        <p className="mb-3 text-xs text-slate-500">{t('mod.webhooks.note')}</p>
        <Check label={t('mod.enabled')} checked={cfg.webhooks.enabled} onChange={(v) => set('webhooks', { enabled: v })} />
      </div>

      {/* Quiz */}
      <div className="rounded-xl border border-slate-800 p-4">
        <h3 className="mb-3 font-medium">{t('mod.quiz')}</h3>
        <p className="mb-3 text-xs text-slate-500">{t('mod.quiz.commands')}</p>
        <div className="mb-3"><Check label={t('mod.enabled')} checked={cfg.quiz.enabled} onChange={(v) => set('quiz', { ...cfg.quiz, enabled: v })} /></div>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t('mod.quiz.title')}</label>
            <input value={cfg.quiz.title} maxLength={100}
              onChange={(e) => set('quiz', { ...cfg.quiz, title: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('mod.quiz.pointsName')}</label>
            <input value={cfg.quiz.pointsName} maxLength={32}
              onChange={(e) => set('quiz', { ...cfg.quiz, pointsName: e.target.value })} className={inputCls} />
          </div>
        </div>
        <div className="mb-3 grid grid-cols-3 gap-3">
          <div><label className={labelCls}>{t('mod.quiz.time')}</label><Num value={cfg.quiz.timePerQuestionSec} min={5} max={600} onChange={(v) => set('quiz', { ...cfg.quiz, timePerQuestionSec: v })} /></div>
          <div><label className={labelCls}>{t('mod.quiz.points')}</label><Num value={cfg.quiz.pointsPerQuestion} min={10} max={1000} onChange={(v) => set('quiz', { ...cfg.quiz, pointsPerQuestion: v })} /></div>
          <div><label className={labelCls}>{t('mod.quiz.perSession')}</label><Num value={cfg.quiz.questionsPerSession} min={1} max={50} onChange={(v) => set('quiz', { ...cfg.quiz, questionsPerSession: v })} /></div>
        </div>

        <label className={labelCls}>{t('mod.quiz.questions')}</label>
        <div className="space-y-3">
          {cfg.quiz.questions.map((q, qi) => (
            <div key={qi} className="rounded-lg border border-slate-800 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-slate-500">#{qi + 1}</span>
                <button type="button" onClick={() => set('quiz', { ...cfg.quiz, questions: cfg.quiz.questions.filter((_, j) => j !== qi) })}
                  className="text-xs text-rose-400 hover:text-rose-300">{t('mod.customcmd.remove')}</button>
              </div>
              <textarea value={q.question} maxLength={300} rows={2} placeholder={t('mod.quiz.questionPh')}
                onChange={(e) => {
                  const qs = [...cfg.quiz.questions];
                  qs[qi] = { ...q, question: e.target.value };
                  set('quiz', { ...cfg.quiz, questions: qs });
                }}
                className={inputCls} />
              <div className="mt-2 space-y-2">
                {q.choices.map((c, ci) => (
                  <div key={ci} className="flex items-center gap-2">
                    <span className="w-4 text-xs text-slate-500">{String.fromCharCode(65 + ci)}</span>
                    <input value={c} maxLength={100}
                      onChange={(e) => {
                        const qs = [...cfg.quiz.questions];
                        const choices = [...q.choices];
                        choices[ci] = e.target.value;
                        qs[qi] = { ...q, choices };
                        set('quiz', { ...cfg.quiz, questions: qs });
                      }}
                      className={inputCls} />
                    {ci === q.correctIndex
                      ? <span className="text-xs text-emerald-400" title={t('mod.quiz.correct')}>✓</span>
                      : <button type="button" onClick={() => {
                          const qs = [...cfg.quiz.questions];
                          qs[qi] = { ...q, correctIndex: ci };
                          set('quiz', { ...cfg.quiz, questions: qs });
                        }}
                        className="whitespace-nowrap text-xs text-slate-500 hover:text-emerald-400">{t('mod.quiz.setCorrect')}</button>}
                    {q.choices.length > 2 && (
                      <button type="button" onClick={() => {
                        const qs = [...cfg.quiz.questions];
                        const choices = q.choices.filter((_, j) => j !== ci);
                        qs[qi] = { ...q, choices, correctIndex: Math.min(q.correctIndex, choices.length - 1) };
                        set('quiz', { ...cfg.quiz, questions: qs });
                      }}
                      className="text-xs text-rose-400 hover:text-rose-300">×</button>
                    )}
                  </div>
                ))}
              </div>
              {q.choices.length < 4 && (
                <button type="button" onClick={() => {
                  const qs = [...cfg.quiz.questions];
                  qs[qi] = { ...q, choices: [...q.choices, ''] };
                  set('quiz', { ...cfg.quiz, questions: qs });
                }}
                className="mt-2 rounded-lg border border-slate-700 px-2 py-1 text-xs hover:border-slate-500">+ {t('mod.quiz.addChoice')}</button>
              )}
              <textarea value={q.explanation} maxLength={500} rows={2} placeholder={t('mod.quiz.explanationPh')}
                onChange={(e) => {
                  const qs = [...cfg.quiz.questions];
                  qs[qi] = { ...q, explanation: e.target.value };
                  set('quiz', { ...cfg.quiz, questions: qs });
                }}
                className={`${inputCls} mt-2`} />
            </div>
          ))}
        </div>
        {cfg.quiz.questions.length < 50 && (
          <button type="button"
            onClick={() => set('quiz', { ...cfg.quiz, questions: [...cfg.quiz.questions, { question: '', choices: ['', ''], correctIndex: 0, explanation: '' }] })}
            className="mt-3 rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:border-slate-500">
            + {t('mod.quiz.addQuestion')}
          </button>
        )}
      </div>
    </div>
  );
}
