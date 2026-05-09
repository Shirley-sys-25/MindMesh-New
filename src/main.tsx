import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {ClerkProvider} from '@clerk/clerk-react';
import { frFR } from '@clerk/localizations';
import App from './App.tsx';
import './index.css';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkAppearance = {
  variables: {
    colorBackground: 'var(--background)',
    colorPrimary: '#a855f7',
    colorText: 'var(--text)',
    colorInputBackground: 'var(--glass-bg)',
    colorInputText: 'var(--text)',
  },
  elements: {
    card: 'bg-transparent shadow-none border-0',
  },
};

if (!PUBLISHABLE_KEY) throw new Error('Missing Publishable Key');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} localization={frFR} appearance={clerkAppearance}>
      <App />
    </ClerkProvider>
  </StrictMode>,
);
