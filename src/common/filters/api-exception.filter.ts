import { Catch, ArgumentsHost, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: string[] | undefined;

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'DUPLICATE_RESOURCE';
        message = 'A record with the same unique value already exists';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'RESOURCE_NOT_FOUND';
        message = 'The requested record was not found';
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR';
      if (status < 500) {
        if (typeof body === 'string') {
          message = body;
        } else if (body && typeof body === 'object' && 'message' in body) {
          const rawMessage = (body as { message?: unknown }).message;
          if (Array.isArray(rawMessage)) {
            details = rawMessage.map(String);
            message = 'Request validation failed';
          } else if (typeof rawMessage === 'string') {
            message = rawMessage;
          }
        }
      }
    }

    response.status(status).json({
      error: { code, message, ...(details ? { details } : {}) },
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
