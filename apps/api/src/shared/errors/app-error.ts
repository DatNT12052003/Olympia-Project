import { CommonErrorCode } from '@olympia/shared';

/**
 * Lỗi nghiệp vụ có chủ đích. Error handler chuyển thành response với `statusCode` và `code`;
 * mọi lỗi khác được coi là lỗi hệ thống (500) và không lộ chi tiết ra ngoài.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Không tìm thấy tài nguyên.') {
    super(404, CommonErrorCode.NotFound, message);
    this.name = 'NotFoundError';
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Chưa xác thực.') {
    super(401, CommonErrorCode.Unauthenticated, message);
    this.name = 'UnauthenticatedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Không có quyền thực hiện hành động này.') {
    super(403, CommonErrorCode.Forbidden, message);
    this.name = 'ForbiddenError';
  }
}
