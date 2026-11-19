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
import { ModerationPage } from '../pages/admin/ModerationPage';
import { PublicSetPage } from '../pages/question-bank/PublicSetPage';
import { QuestionBankPage } from '../pages/question-bank/QuestionBankPage';
import { QuestionEditorPage } from '../pages/question-bank/QuestionEditorPage';
import { QuestionSetPage } from '../pages/question-bank/QuestionSetPage';
import { HostLayout } from '../pages/rooms/HostLayout';
import { HostRoomsPage } from '../pages/rooms/HostRoomsPage';
import { JoinRoomPage } from '../pages/rooms/JoinRoomPage';
import { RoomFormPage } from '../pages/rooms/RoomFormPage';
import { RoomPage } from '../pages/rooms/RoomPage';
import { ScriptBuilderPage } from '../pages/scripts/ScriptBuilderPage';
import { ScriptsPage } from '../pages/scripts/ScriptsPage';
import { AppLayout } from './AppLayout';

/**
 * Trang tài khoản (đăng nhập, đăng ký...), trang quản trị, trang Host và các màn phòng thi có khung
 * riêng theo thiết kế, không dùng header chung của AppLayout.
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
              { path: 'duyet-noi-dung', element: <ModerationPage /> },
            ],
          },
        ],
      },
      {
        path: 'phong-thi',
        element: <RequireAuth permission={SystemPermission.CreateRooms} />,
        children: [
          { element: <HostLayout />, children: [{ index: true, element: <HostRoomsPage /> }] },
          { path: 'tao', element: <RoomFormPage /> },
          { path: ':roomId/sua', element: <RoomFormPage /> },
        ],
      },
      {
        path: 'kich-ban',
        element: <RequireAuth permission={SystemPermission.CreateRooms} />,
        children: [
          { element: <HostLayout />, children: [{ index: true, element: <ScriptsPage /> }] },
          { path: 'moi', element: <ScriptBuilderPage /> },
          { path: ':scriptId', element: <ScriptBuilderPage /> },
        ],
      },
      {
        path: 'ngan-hang',
        element: <RequireAuth permission={SystemPermission.ManageOwnQuestions} />,
        children: [
          {
            element: <HostLayout />,
            children: [
              { index: true, element: <QuestionBankPage /> },
              { path: 'bo-de/:setId', element: <QuestionSetPage /> },
              { path: 'bo-public/:versionId', element: <PublicSetPage /> },
            ],
          },
          { path: 'cau-hoi/moi', element: <QuestionEditorPage /> },
          { path: 'cau-hoi/:questionId', element: <QuestionEditorPage /> },
        ],
      },
      { path: 'vao-phong', element: <JoinRoomPage /> },
      { path: 'vao-phong/:code', element: <JoinRoomPage /> },
      { path: 'phong/:roomId', element: <RoomPage /> },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          {
            element: <RequireAuth />,
            children: [{ path: 'tai-khoan', element: <AccountPage /> }],
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
