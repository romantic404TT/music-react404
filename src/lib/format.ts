export function formatDuration(seconds: number | undefined | null): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** 播放量在原版里走 万/亿 缩写 */
export function formatPlayCount(n: number | undefined | null): string {
  const v = Number(n) || 0;
  if (v >= 100000000) return (v / 100000000).toFixed(v >= 1000000000 ? 0 : 1) + '亿';
  if (v >= 10000) return (v / 10000).toFixed(v >= 1000000 ? 0 : 1) + '万';
  return String(v);
}

/** 毫秒 → "1小时24分" 这种口语文案，首页「今日聆听」用 */
export function formatListenMs(ms: number): string {
  const totalMin = Math.floor((Number(ms) || 0) / 60000);
  if (totalMin < 60) return `${totalMin} 分钟`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

export function formatDateStamp(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function formatChineseDate(d: Date = new Date()): string {
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`;
}

export function formatClock(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function relativeTime(ts: number | undefined | null): string {
  const t = Number(ts) || 0;
  if (!t) return '';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(t).toLocaleDateString('zh-CN');
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
