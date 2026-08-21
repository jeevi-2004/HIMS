import React from 'react';
import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { NotificationProvider } from '../../context/NotificationContext';
import createMockQueryClient from './mockQueryClient';

export const renderWithProviders = (ui, { initialEntries = ['/'], queryClient = createMockQueryClient() } = {}) => {
  const Wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <MemoryRouter initialEntries={initialEntries}>
          {children}
        </MemoryRouter>
      </NotificationProvider>
    </QueryClientProvider>
  );

  return render(ui, { wrapper: Wrapper });
};

export default renderWithProviders;
