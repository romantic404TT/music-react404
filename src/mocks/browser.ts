import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/**
 * MSW 浏览器端 setup。
 *
 * 只在 mock 打开时加载（见 src/main.tsx 的条件 dynamic import），
 * 这样接真后端只需 VITE_ENABLE_MSW=0 重新构建，业务代码一行都不用改。
 */
export async function startMocks(): Promise<void> {
  const worker = setupWorker(...handlers);

  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    quiet: true,
  });
}
