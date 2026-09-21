import type { RequestHandler } from 'msw';
import { accountHandlers } from './account';
import { contentHandlers } from './content';
import { libraryHandlers } from './library';
import { localHandlers } from './local';
import { playbackHandlers } from './playback';
import { searchHandlers } from './search';

export const handlers: RequestHandler[] = [
  ...localHandlers,
  ...searchHandlers,
  ...playbackHandlers,
  ...libraryHandlers,
  ...contentHandlers,
  ...accountHandlers,
];
