import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import MoodSheet from './MoodSheet';
import './styles.css';

const Root = location.hash === '#moods' ? MoodSheet : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
