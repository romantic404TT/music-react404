import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/globals.css';

/**
 * 入口。
 *
 * mock 只在 VITE_ENABLE_MSW 不为 '0' 时加载，并且用动态 import，
 * 所以生产构建里把 VITE_ENABLE_MSW=0 传进去就能完全不打进 MSW。
 */
async function bootstrap(): Promise<void> {
  const enabled = import.meta.env.VITE_ENABLE_MSW !== '0';

  if (enabled) {
    const { startMocks } = await import('./mocks/browser');
    await startMocks();
  }

  const container = document.getElementById('root');
  if (!container) throw new Error('#root not found');

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap().catch((err: unknown) => {
  const container = document.getElementById('root');
  const message = err instanceof Error ? err.message : String(err);
  if (container) {
    container.innerHTML =
      '<pre style="color:#E8ECEF;background:#08090B;padding:24px;font:12px/1.6 monospace;white-space:pre-wrap">' +
      'Mineradio 启动失败\n\n' + message +
      '\n\n如果是 MSW 注册失败，请确认 public/mockServiceWorker.js 存在，或改用 VITE_ENABLE_MSW=0 npm run dev。</pre>';
  }
});
