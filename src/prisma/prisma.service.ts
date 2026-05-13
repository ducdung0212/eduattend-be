import { BeforeApplicationShutdown, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy, BeforeApplicationShutdown {
  constructor() {
    // Khởi tạo Pool kết nối của Postgres thông qua biến môi trường
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    
    // Đưa Pool vào Adapter của Prisma 7
    const adapter = new PrismaPg(pool);

    super({
      adapter, // Bắt buộc phải truyền adapter vào đây
      log: ['warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async beforeApplicationShutdown() {
    await this.$disconnect();
  }
}