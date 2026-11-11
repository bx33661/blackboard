/// <reference types="vite/client" />

import type { GraphSnapshot } from './types';

declare global {
  interface Window {
    __PINWHY_DATA__?: GraphSnapshot;
  }
}

export {};
