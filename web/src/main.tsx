import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import appIcon from '../../design/pinwhy-logo/pinwhy-mark-mint.svg?inline';
import { App } from './App';
import { configureElk } from './graph';
import { locale, t } from './i18n';

configureElk(() => new ELK({ workerUrl: elkWorkerUrl }));
document.documentElement.lang = locale;
document.title = t('app.title');
const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/svg+xml';
favicon.href = appIcon;
document.head.appendChild(favicon);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
