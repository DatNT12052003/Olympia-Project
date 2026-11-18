import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createQueryClient } from './app/query-client';
import { routes } from './app/routes';
import { initAuthSession } from './lib/auth-session';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Không tìm thấy phần tử #root');
}

initAuthSession();
const queryClient = createQueryClient();
const router = createBrowserRouter(routes);

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
