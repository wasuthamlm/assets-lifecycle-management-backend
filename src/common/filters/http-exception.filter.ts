import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { QueryFailedError } from 'typeorm';

// Postgres error codes ที่แปลงเป็น 409 Conflict แทน 500 ดิบ — เจอบ่อยตอนลบ master data ที่ยังมีอ้างอิงอยู่
// (FK_VIOLATION) หรือสร้าง/แก้ record ที่ชน unique constraint พร้อมกัน (UNIQUE_VIOLATION)
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_UNIQUE_VIOLATION = '23505';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsHandler');

  constructor(private readonly cls: ClsService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = this.cls.getId();

    let status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    let message: unknown =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    if (exception instanceof QueryFailedError) {
      const pgCode = (exception as any).code;
      if (pgCode === PG_FOREIGN_KEY_VIOLATION) {
        status = HttpStatus.CONFLICT;
        message = 'ไม่สามารถทำรายการนี้ได้ เนื่องจากยังมีข้อมูลอื่นอ้างอิงอยู่ (foreign key constraint)';
      } else if (pgCode === PG_UNIQUE_VIOLATION) {
        status = HttpStatus.CONFLICT;
        message = 'ข้อมูลนี้ซ้ำกับที่มีอยู่แล้วในระบบ (unique constraint)';
      }
    }

    const logLine = `[${requestId}] ${request.method} ${request.url} ${status}`;
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(logLine, stack);
    } else {
      this.logger.warn(logLine);
    }

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId,
      message: typeof message === 'string' ? message : (message as any).message || message,
    });
  }
}
