import '@fontsource-variable/manrope';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { AppProvider } from './store/AppProvider';
import { createApp } from './store/controller';
import { RemoteController } from './store/RemoteController';

const controller = (await RemoteController.connect()) ?? createApp();

registerSW({ immediate: true });

const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable dans index.html.');

createRoot(root).render(
  <StrictMode>
    <AppProvider controller={controller}>
      <App />
    </AppProvider>
  </StrictMode>,
);
