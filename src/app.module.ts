import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DocumentsModule } from './documents/documents.module';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        url: process.env.UPSTASH_REDIS_REST_URL,
        maxRetriesPerRequest: null,
      },
    }),
    DocumentsModule,
  ],
})
export class AppModule {}
