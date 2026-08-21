import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import { WorkspaceProvider } from './context/WorkspaceContext'
import { BillingSettingsProvider } from './context/BillingSettingsContext'
import './index.css'
import App from './App.jsx'

const queryClient = new QueryClient();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WorkspaceProvider>
            <BillingSettingsProvider>
              <App />
              <Toaster 
                position="bottom-right"
                toastOptions={{
                  className: 'font-sans text-xs font-semibold rounded-xl border border-slate-100 shadow-enterprise p-3 bg-white text-slate-800',
                  success: {
                    iconTheme: { primary: '#2F63F2', secondary: '#fff' }
                  }
                }}
              />
            </BillingSettingsProvider>
          </WorkspaceProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
