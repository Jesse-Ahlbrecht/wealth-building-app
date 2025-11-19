import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Apply theme immediately to prevent flash
const savedTheme = localStorage.getItem('theme') || 'system';
if (savedTheme === 'system') {
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (prefersDark) {
    document.body.classList.add('dark-theme');
  }
} else if (savedTheme === 'dark') {
  document.body.classList.add('dark-theme');
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
