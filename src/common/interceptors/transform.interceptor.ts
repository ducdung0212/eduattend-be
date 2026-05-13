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
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const status = context.switchToHttp().getResponse().statusCode;

    return next.handle().pipe(
      map((data) => {
        let responseMessage = 'Thành công'; // Mặc định nếu không truyền message
        let responseData = data;

        // Kiểm tra xem data trả về có phải là object và có chứa key 'message' không
        if (data && typeof data === 'object' && 'message' in data) {
          responseMessage = data.message;
          
          // Bóc tách 'message' ra, phần còn lại gom vào biến 'rest'
          const { message, ...rest } = data;
          
          // Nếu 'rest' rỗng (tức là chỉ có mỗi message), thì gán data = null
          responseData = Object.keys(rest).length > 0 ? rest : null;
        }

        return {
          status: status,
          message: responseMessage,
          data: responseData,
        };
      }),
    );
  }
}