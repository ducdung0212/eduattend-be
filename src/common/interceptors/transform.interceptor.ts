import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  status: number;
  message: string;
  data: T | null;
  meta?: any;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const status = context.switchToHttp().getResponse().statusCode;

    return next.handle().pipe(
      map((resData) => {
        let responseMessage = 'Thành công';
        let responseData = resData;
        let responseMeta = undefined;

        if (resData && typeof resData === 'object') {
          // 1. Nếu service có gửi kèm message tùy chỉnh
          if ('message' in resData) {
            responseMessage = resData.message;
          }

          // 2. Nếu service trả về cấu trúc phân trang dữ liệu (findAll)
          if ('data' in resData && 'meta' in resData) {
            responseData = resData.data;
            responseMeta = resData.meta;
          } 
          // 3. Nếu service trả về dạng có message và dữ liệu thô kèm theo (create, update)
          else if ('message' in resData && 'data' in resData) {
            responseData = resData.data;
          }
          // 4. Nếu service chỉ trả về duy nhất message (ví dụ hàm remove)
          else if ('message' in resData && Object.keys(resData).length === 1) {
            responseData = null;
          }
        }

        return {
          status: status,
          message: responseMessage,
          data: responseData,
          ...(responseMeta ? { meta: responseMeta } : {}),
        };
      }),
    );
  }
}