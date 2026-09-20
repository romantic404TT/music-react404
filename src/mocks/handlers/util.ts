import { delay, http, HttpResponse } from 'msw';

/** 原版后端有网络抖动，加一点延迟让骨架屏有机会出现（保持很小，不拖慢演示） */
const NET = () => delay(90 + Math.random() * 160);

export { NET };
export { http, HttpResponse };
