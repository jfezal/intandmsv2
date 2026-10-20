import { Module } from '@nestjs/common';
import { DocumentDownloadController, DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  controllers: [DocumentsController, DocumentDownloadController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
