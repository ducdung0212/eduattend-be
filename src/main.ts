import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { ValidationPipe, VersioningType } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Cho phép Frontend truy cập API
  app.enableCors({
    origin: 'http://localhost:3000', // Port mặc định của NextJS
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  // 3. Đặt tiền tố 'api' cho toàn bộ hệ thống
  app.setGlobalPrefix('api');

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  // 4. Bật tính năng Versioning và đặt mặc định là version 1 (v1)
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useGlobalInterceptors(new TransformInterceptor());
  
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.listen(process.env.PORT || 3001);
}
bootstrap();
