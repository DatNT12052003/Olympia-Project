import type { ApiErrorBody } from '@olympia/shared';
import { CommonErrorCode } from '@olympia/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { AppError, NotFoundError, TooManyRequestsError } from '../errors/app-error';

/** Lỗi do middleware của Express/body-parser ném ra (có `status` và `expose`). */
interface HttpLikeError {
  status: number;
  expose?: boolean;
  type?: string;
}

function isHttpLikeError(err: unknown): err is HttpLikeError {
  return (
    typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number'
  );
}

function body(code: string, message: string, details?: unknown): ApiErrorBody {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Không tìm thấy ${req.method} ${req.path}.`));
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, _req, res, _next) => {
    if (err instanceof AppError) {
      if (err instanceof TooManyRequestsError) {
        res.setHeader('Retry-After', String(err.retryAfterSeconds));
      }
      res.status(err.statusCode).json(body(err.code, err.message, err.details));
      return;
    }

    if (err instanceof ZodError) {
      res.status(400).json(
        body(
          CommonErrorCode.ValidationError,
          'Dữ liệu không hợp lệ.',
          err.issues.map(({ path, message }) => ({ path, message })),
        ),
      );
      return;
    }

    if (isHttpLikeError(err) && err.status >= 400 && err.status < 500 && err.expose !== false) {
      const code =
        err.status === 413 ? CommonErrorCode.PayloadTooLarge : CommonErrorCode.BadRequest;
      const message = err.status === 413 ? 'Dữ liệu gửi lên quá lớn.' : 'Yêu cầu không hợp lệ.';
      res.status(err.status).json(body(code, message));
      return;
    }

    logger.error({ err }, 'Lỗi không xử lý được');
    res.status(500).json(body(CommonErrorCode.InternalError, 'Đã có lỗi xảy ra.'));
  };
}
