
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error("Critical Error: Could not find root element to mount to");
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
          console.log('SW registered: ', registration);
        }).catch(registrationError => {
          console.log('SW registration failed: ', registrationError);
        });
      });
    }
  } catch (err) {
    console.error("React Mounting Error:", err);
    rootElement.innerHTML = `
      <div style="padding: 40px; text-align: center; font-family: sans-serif; color: #ef4444;">
        <h1 style="font-weight: 900; margin-bottom: 16px;">System Startup Failure</h1>
        <p style="color: #64748b; margin-bottom: 24px;">The application failed to initialize. This is usually due to a module resolution error or invalid API keys.</p>
        <div style="background: #f8fafc; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 12px; border: 1px solid #e2e8f0; display: inline-block; text-align: left;">
          ${err instanceof Error ? err.message : 'Unknown Error'}
        </div>
        <div style="margin-top: 24px;">
          <button onclick="window.location.reload()" style="padding: 12px 24px; background: #4f46e5; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">Retry Boot</button>
        </div>
      </div>
    `;
  }
}
