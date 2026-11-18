import { SystemPermission } from '@olympia/shared';
import type { RouteObject } from 'react-router';
import { RedirectIfAuthenticated, RequireAuth } from '../features/auth/RequireAuth';
import { AccountPage } from '../pages/AccountPage';
import { AdminLayout } from '../pages/admin/AdminLayout';
import { AdminOrganizationsPage } from '../pages/admin/AdminOrganizationsPage';
import { AdminUsersPage } from '../pages/admin/AdminUsersPage';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage';
import { VerifyEmailPage } from '../pages/auth/VerifyEmailPage';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { RouteErrorPage } from '../pages/RouteErrorPage';
import { AppLayout } from './AppLayout';

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      {
        element: <RedirectIfAuthenticated />,
        children: [{ path: 'dang-nhap', element: <LoginPage /> }],
      },
      {
        element: <RedirectIfAuthenticated to="/tai-khoan" />,
        children: [{ path: 'dang-ky', element: <RegisterPage /> }],
      },
      { path: 'quen-mat-khau', element: <ForgotPasswordPage /> },
      { path: 'dat-lai-mat-khau', element: <ResetPasswordPage /> },
      { path: 'xac-minh-email', element: <VerifyEmailPage /> },
      {
        element: <RequireAuth />,
        children: [{ path: 'tai-khoan', element: <AccountPage /> }],
      },
      {
        path: 'quan-tri',
        element: <RequireAuth permission={SystemPermission.ManageUsers} />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              { index: true, element: <AdminUsersPage /> },
              { path: 'to-chuc', element: <AdminOrganizationsPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
