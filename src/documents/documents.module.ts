import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DocumentsProcessor } from './documents.processor';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'documents',
    }),
    StorageModule,
  ],
  providers: [DocumentsProcessor],
})
export class DocumentsModule {}
