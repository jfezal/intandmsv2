import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthenticatedRequest, SessionAuthGuard } from '../auth/session-auth.guard';
import { DocumentsService } from './documents.service';

@ApiTags('documents')
@Controller('repositories/:repositoryId/documents')
@UseGuards(SessionAuthGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Param('repositoryId') repositoryId: string,
    @Query('folderId') folderId?: string,
  ) {
    return this.documents.list(request.user!, repositoryId, folderId);
  }

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  async upload(
    @Req() request: AuthenticatedRequest & FastifyRequest,
    @Param('repositoryId') repositoryId: string,
  ) {
    const file = await request.file();
    if (!file) {
      throw new Error('Missing file.');
    }
    const folderIdField = file.fields.folderId;
    const folderId =
      folderIdField && typeof folderIdField === 'object' && 'value' in folderIdField
        ? String(folderIdField.value)
        : undefined;

    return this.documents.uploadManaged(request.user!, repositoryId, {
      folderId: folderId || undefined,
      displayName: file.filename,
      mimeType: file.mimetype || 'application/octet-stream',
      stream: file.file,
    });
  }
}

@Controller('documents')
@UseGuards(SessionAuthGuard)
export class DocumentDownloadController {
  constructor(private readonly documents: DocumentsService) {}

  @Get(':documentId/download')
  async download(
    @Req() request: AuthenticatedRequest,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const payload = await this.documents.download(request.user!, documentId);
    void reply.header('Content-Type', payload.mimeType);
    void reply.header(
      'Content-Disposition',
      `attachment; filename="${payload.displayName.replace(/"/g, '')}"`,
    );
    return payload.bytes;
  }
}
