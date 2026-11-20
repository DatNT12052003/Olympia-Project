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
  constructor(
    message = 'Chưa xác thực.',
    code: string = CommonErrorCode.Unauthenticated,
    details?: unknown,
  ) {
    super(401, code, message, details);
    this.name = 'UnauthenticatedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = 'Không có quyền thực hiện hành động này.',
    code: string = CommonErrorCode.Forbidden,
  ) {
    super(403, code, message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: string = CommonErrorCode.Conflict) {
    super(409, code, message);
    this.name = 'ConflictError';
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, code: string = CommonErrorCode.BadRequest) {
    super(400, code, message);
    this.name = 'BadRequestError';
  }
}

/** Vượt giới hạn tần suất; error handler gắn header `Retry-After`. */
export class TooManyRequestsError extends AppError {
  constructor(
    readonly retryAfterSeconds: number,
    message = 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.',
  ) {
    super(429, CommonErrorCode.TooManyRequests, message, { retryAfterSeconds });
    this.name = 'TooManyRequestsError';
  }
}
