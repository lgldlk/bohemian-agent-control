import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import App from './App.tsx';
import { ensureBoardPlugins } from '../builtin-plugins/index';
import { loadEnabledUserPlugins } from './plugin-system/user-plugins/loader';

async function bootstrap() {
  ensureBoardPlugins();
  await loadEnabledUserPlugins();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
