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
import { ComingSoonPage } from '../pages/ComingSoonPage';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { RouteErrorPage } from '../pages/RouteErrorPage';
import { AppLayout } from './AppLayout';

/**
 * Trang tài khoản (đăng nhập, đăng ký...) và trang quản trị có khung riêng theo thiết kế, không
 * dùng header chung của AppLayout.
 */
export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
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
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          {
            element: <RequireAuth />,
            children: [{ path: 'tai-khoan', element: <AccountPage /> }],
          },
          {
            path: 'vao-phong',
            element: (
              <ComingSoonPage
                title="Vào phòng bằng mã"
                description="Tham gia phòng thi bằng mã phòng hoặc link mời, không cần tài khoản, sẽ có khi chức năng phòng thi ra mắt."
              />
            ),
          },
          {
            path: 'dieu-khoan',
            element: (
              <ComingSoonPage
                title="Điều khoản sử dụng"
                description="Nội dung điều khoản sử dụng đang được soạn thảo."
              />
            ),
          },
          {
            path: 'chinh-sach-quyen-rieng-tu',
            element: (
              <ComingSoonPage
                title="Chính sách quyền riêng tư"
                description="Nội dung chính sách quyền riêng tư đang được soạn thảo và rà soát pháp lý."
              />
            ),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
