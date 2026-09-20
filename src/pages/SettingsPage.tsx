import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { EmptyState, Segmented, Slider } from '@/components/ui/primitives';
import { IconLoading, IconRefresh, IconUpload } from '@/components/ui/Icons';
import { fetchAppVersion, fetchUpdateLatest } from '@/services/content';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { DEFAULT_QUALITY, QUALITY_OPTIONS, qualityLabel } from '@/types/track';
import type { Provider, QualityLevel } from '@/types/track';
import type { AppVersionResponse, UpdateLatestResponse } from '@/types/api';

/**
 * 设置页。只放真实生效的开关：这些值全部由 settingsStore 落到 localStorage，
 * 并且被播放解析、控制条与音频引擎读取，没有任何「存了但没人用」的字段。
 *
 * 关于与更新走 /api/app/version 与 /api/update/latest。
 * 原版 2.0.3+ 把 /api/update/download 与 /patch 一律短路成 410 UPDATE_EXTERNAL_ONLY，
 * 所以这里也明确不提供应用内下载，只给外部下载页。
 */

const QUALITY_PROVIDERS: { key: Provider; label: string }[] = [
  { key: 'netease', label: '网易云' },
  { key: 'qq', label: 'QQ 音乐' },
  { key: 'kugou', label: '酷狗' },
  { key: 'qishui', label: '汽水音乐' },
];

const FLAGS: { key: 'controlsAutoHide' | 'userCapsuleAutoHide' | 'fxFabAutoHide' | 'diyPlayerMode'; label: string; hint: string }[] = [
  { key: 'controlsAutoHide', label: '控制条自动隐藏', hint: '鼠标离开热区后收起，播放中不会主动弹出来。' },
  { key: 'userCapsuleAutoHide', label: '账号胶囊自动隐藏', hint: '标题栏右侧的头像与更新入口一并淡出。' },
  { key: 'fxFabAutoHide', label: '视觉控制台按钮自动隐藏', hint: '右下角那颗 fx 悬浮按钮，用 K 键仍可打开。' },
  { key: 'diyPlayerMode', label: 'DIY 播放模式', hint: '开放封面裁切与自定义歌词等手工入口。' },
];

const SHORTCUTS = [
  { keys: 'Space', text: '播放 / 暂停' },
  { keys: '← / →', text: '上一首 / 下一首' },
  { keys: '↑ / ↓', text: '音量 ±5%' },
  { keys: 'F', text: '全屏切换' },
];

function reasonText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : '请求失败';
}

export function SettingsPage() {
  const volume = useSettingsStore((s) => s.volume);
  const setVolume = useSettingsStore((s) => s.setVolume);
  const fade = useSettingsStore((s) => s.fade);
  const setFade = useSettingsStore((s) => s.setFade);
  const quality = useSettingsStore((s) => s.quality);
  const setQuality = useSettingsStore((s) => s.setQuality);
  const toggleFlag = useSettingsStore((s) => s.toggleFlag);
  const startupResumeMode = useSettingsStore((s) => s.startupResumeMode);
  const setStartupResumeMode = useSettingsStore((s) => s.setStartupResumeMode);
  const pushToast = useUiStore((s) => s.pushToast);

  const flags = {
    controlsAutoHide: useSettingsStore((s) => s.controlsAutoHide),
    userCapsuleAutoHide: useSettingsStore((s) => s.userCapsuleAutoHide),
    fxFabAutoHide: useSettingsStore((s) => s.fxFabAutoHide),
    diyPlayerMode: useSettingsStore((s) => s.diyPlayerMode),
  };

  const [version, setVersion] = useState<AppVersionResponse | null>(null);
  const [update, setUpdate] = useState<UpdateLatestResponse | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const loadUpdate = useCallback(() => {
    const ac = new AbortController();
    let alive = true;
    setUpdateLoading(true);
    setUpdateError(null);

    void fetchAppVersion(ac.signal)
      .then((v) => {
        if (alive) setVersion(v);
      })
      .catch(() => undefined);

    void fetchUpdateLatest(ac.signal)
      .then((u) => {
        if (alive) setUpdate(u);
      })
      .catch((e: unknown) => {
        if (alive) setUpdateError(reasonText(e));
      })
      .finally(() => {
        if (alive) setUpdateLoading(false);
      });

    return () => {
      alive = false;
      ac.abort();
    };
  }, []);

  useEffect(() => loadUpdate(), [loadUpdate]);

  return (
    <div className="mx-auto w-home max-w-full pb-[150px] pt-16">
      <header>
        <div className="flex items-baseline gap-3">
          <h1 className="text-[20px] font-semibold tracking-wide text-[var(--fc-ink)]">设置</h1>
          <span className="label-caps">settings</span>
        </div>
        <p className="mt-1 text-[11.5px] text-[var(--fc-muted)]">
          每一项都即时写入 localStorage，改完立刻生效；音质在下一次解析音源时生效。
        </p>
      </header>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {/* ---- 音质 ---- */}
        <Panel title="音质" hint="按平台分别记忆，切平台不会影响其他平台。">
          <div className="flex flex-col gap-3.5">
            {QUALITY_PROVIDERS.map((p) => {
              const active: QualityLevel = quality[p.key] ?? DEFAULT_QUALITY[p.key];
              return (
                <div key={p.key} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[12.5px] text-[var(--fc-ink-2)]">
                    <i className="source-dot" data-provider={p.key} />
                    {p.label}
                  </span>
                  <Segmented<QualityLevel>
                    value={active}
                    onChange={(v) => {
                      setQuality(p.key, v);
                      pushToast(`${p.label} · ${qualityLabel(p.key, v)}，下一首生效`, 'info');
                    }}
                    options={QUALITY_OPTIONS[p.key].map((q) => ({ value: q, label: qualityLabel(p.key, q) }))}
                  />
                </div>
              );
            })}
          </div>
          <p className="mt-3 font-mono text-[10px] text-[var(--fc-muted)]">
            汽水只有一个匹配源档位，这是后端能力，不是这里少渲染了选项。
          </p>
        </Panel>

        {/* ---- 音量与淡入淡出 ---- */}
        <Panel title="音量与淡入淡出" hint="淡变作用在 GainNode 上，切歌与暂停都走同一套曲线。">
          <Slider
            label="音量"
            value={volume}
            min={0}
            max={1}
            step={0.01}
            onChange={setVolume}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Slider
              label="淡入"
              value={fade.fadeInMs}
              min={0}
              max={3000}
              step={20}
              onChange={(v) => setFade({ fadeInMs: v })}
              format={(v) => `${Math.round(v)} ms`}
            />
            <Slider
              label="淡出"
              value={fade.fadeOutMs}
              min={0}
              max={3000}
              step={20}
              onChange={(v) => setFade({ fadeOutMs: v })}
              format={(v) => `${Math.round(v)} ms`}
            />
          </div>
        </Panel>

        {/* ---- 界面显隐 ---- */}
        <Panel title="界面显隐" hint="沉浸式观感相关的四个开关。">
          <div className="flex flex-col divide-y divide-[var(--fc-hair)]">
            {FLAGS.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="block text-[12.5px] text-[var(--fc-ink)]">{f.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--fc-muted)]">{f.hint}</span>
                </span>
                <button
                  className="chip shrink-0"
                  role="switch"
                  aria-checked={flags[f.key]}
                  data-active={flags[f.key]}
                  style={{
                    color: flags[f.key] ? 'var(--home-accent)' : 'var(--fc-muted)',
                    borderColor: flags[f.key] ? 'var(--glass-border)' : undefined,
                    background: flags[f.key] ? 'rgba(var(--home-accent-rgb), .10)' : undefined,
                  }}
                  onClick={() => toggleFlag(f.key)}
                >
                  {flags[f.key] ? '开' : '关'}
                </button>
              </div>
            ))}
          </div>
        </Panel>

        {/* ---- 启动 / 快捷键 ---- */}
        <Panel title="启动与快捷键" hint="启动行为在下次打开时生效；快捷键在输入框与滑条聚焦时不会误触。">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12.5px] text-[var(--fc-ink-2)]">启动时</span>
            <Segmented<'resume' | 'restart'>
              value={startupResumeMode}
              onChange={setStartupResumeMode}
              options={[
                { value: 'resume', label: '接上次队列' },
                { value: 'restart', label: '每次从头开始' },
              ]}
            />
          </div>

          <div className="mt-4 flex flex-col divide-y divide-[var(--fc-hair)] border-t border-[var(--fc-hair)] pt-1">
            {SHORTCUTS.map((k) => (
              <div key={k.keys} className="flex items-center justify-between gap-3 py-2">
                <span className="font-mono text-[11px] text-[var(--fc-ink)]">{k.keys}</span>
                <span className="text-[11.5px] text-[var(--fc-muted)]">{k.text}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* ---- 关于与更新 ---- */}
        <Panel
          title="关于与更新"
          hint="本复刻只读版本与更新说明，不接管下载：原版的 /api/update/download 与 /patch 在 2.0.3 之后一律返回 410 UPDATE_EXTERNAL_ONLY。"
          className="xl:col-span-2"
        >
          {updateError ? (
            <EmptyState
              title="更新信息没取到"
              hint={updateError}
              action={
                <button className="btn" onClick={loadUpdate}>
                  <IconRefresh size={13} />
                  重试
                </button>
              }
            />
          ) : (
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="wordmark text-[19px] font-black text-[var(--fc-ink)]">Mine</span>
                  <span className="wordmark text-[19px] font-black text-[var(--home-accent)]">radio</span>
                  <span className="font-mono text-[11px] text-[var(--fc-muted)]">
                    v{version?.version ?? update?.currentVersion ?? '—'}
                    {version?.name ? ` · ${version.name}` : ''}
                  </span>
                </div>

                <p className="mt-2 font-mono text-[10.5px] text-[var(--fc-muted)]">
                  {update
                    ? update.hasUpdate
                      ? `发现新版本 v${update.latestVersion ?? '?'}`
                      : `已是最新（v${update.currentVersion}）`
                    : updateLoading
                      ? '正在检查更新…'
                      : '版本信息未取到'}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button className="btn" onClick={loadUpdate} disabled={updateLoading}>
                    {updateLoading ? (
                      <IconLoading size={13} style={{ animation: 'spin-slow 1s linear infinite' }} />
                    ) : (
                      <IconRefresh size={13} />
                    )}
                    检查更新
                  </button>
                  <button
                    className="btn"
                    title="应用内下载在原版 2.0.3+ 已被移除（410 UPDATE_EXTERNAL_ONLY），只能从外部页面获取"
                    onClick={() => pushToast('应用内下载不可用：410 UPDATE_EXTERNAL_ONLY', 'warn')}
                  >
                    <IconUpload size={13} />
                    应用内下载
                  </button>
                </div>

                {update?.downloadPages?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {update.downloadPages.map((d) => (
                      <a key={d.url} className="chip hover:bg-white/10" href={d.url} target="_blank" rel="noreferrer">
                        {d.label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="min-w-0">
                <p className="label-caps mb-2">更新说明</p>
                {update?.body ? (
                  <pre className="max-h-[168px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-[var(--glass-border-soft)] bg-black/25 p-3 font-sans text-[11.5px] leading-relaxed text-[var(--fc-ink-2)]">
                    {update.body}
                  </pre>
                ) : (
                  <p className="text-[11.5px] text-[var(--fc-muted)]">
                    {updateLoading ? '正在拉取发布说明…' : '没有取到发布说明。'}
                  </p>
                )}
                {update?.releaseUrl ? (
                  <a className="mt-2 inline-block font-mono text-[10.5px] text-[var(--home-accent)] underline-offset-4 hover:underline" href={update.releaseUrl} target="_blank" rel="noreferrer">
                    {update.releaseUrl}
                  </a>
                ) : null}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

/** 分区卡片：标题 + 一行说明 + 内容 */
function Panel({ title, hint, children, className = '' }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`glass-panel rounded-tile p-5 ${className}`}>
      <h2 className="text-[14px] font-semibold tracking-wide text-[var(--fc-ink)]">{title}</h2>
      {hint ? <p className="mt-1 text-[11px] leading-relaxed text-[var(--fc-muted)]">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
