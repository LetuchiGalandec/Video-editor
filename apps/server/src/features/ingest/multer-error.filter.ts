import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { MulterError } from 'multer';

/** Maps multer's own errors to friendly HTTP codes (size → 413, else → 400). */
@Catch(MulterError)
export class MulterErrorFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const tooBig = exception.code === 'LIMIT_FILE_SIZE';
    const status = tooBig
      ? HttpStatus.PAYLOAD_TOO_LARGE
      : HttpStatus.BAD_REQUEST;
    res.status(status).json({
      statusCode: status,
      message: tooBig
        ? 'That file is larger than the upload limit.'
        : `Upload failed: ${exception.message}`,
    });
  }
}
