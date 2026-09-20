import type { RequestHandler } from 'msw';
import { accountHandlers } from './account';
import { contentHandlers } from './content';
import { libraryHandlers } from './library';
import { playbackHandlers } from './playback';
import { searchHandlers } from './search';

export const handlers: RequestHandler[] = [
  ...searchHandlers,
  ...playbackHandlers,
  ...libraryHandlers,
  ...contentHandlers,
  ...accountHandlers,
];
