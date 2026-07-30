import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch() // Để trống @Catch() nghĩa là nó sẽ bắt TOÀN BỘ mọi loại lỗi
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Mặc định là lỗi 500 (Internal Server Error)
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: any = 'Đã có lỗi hệ thống xảy ra, vui lòng thử lại sau.';

    // Nếu lỗi là do chúng ta chủ động ném ra (VD: UnauthorizedException, BadRequestException)
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // NestJS thường trả về message dưới dạng mảng nếu bị lỗi Validation (kiểm tra dữ liệu đầu vào)
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        message = (exceptionResponse as any).message || exception.message;
      } else {
        message = exception.message;
      }
    } 
    // Bắt thêm lỗi đặc thù của Prisma (Ví dụ: Trùng lặp dữ liệu Unique)
    else if (typeof exception === 'object' && exception !== null && 'code' in exception) {
       if ((exception as any).code === 'P2002') {
          status = HttpStatus.CONFLICT; // 409
          message = 'Dữ liệu này đã tồn tại trong hệ thống.';
       } else if ((exception as any).code === 'P2003') {
          status = HttpStatus.CONFLICT; // 409
          message = 'Không thể xóa dữ liệu này vì đang có các dữ liệu khác phụ thuộc vào nó.';
       } else {
          // Ghi log các lỗi không lường trước (Database rớt, sai cú pháp SQL...)
          console.error(' [Unhandled System Error]:', exception);
       }
    } else {
       console.error(' [Unknown Error]:', exception);
       try {
           require('fs').appendFileSync('error.log', `\n--- [Unknown Error] ---\n${exception instanceof Error ? exception.stack : JSON.stringify(exception)}\n`);
       } catch (e) {}
    }

    // Đảm bảo message trả về luôn là một chuỗi (String) dễ đọc cho Frontend
    const finalMessage = Array.isArray(message) ? message[0] : message;

    // Định dạng JSON chuẩn xuất ra Frontend
    response.status(status).json({
      status: status,
      message: finalMessage,
      data: null,
    });
  }
}