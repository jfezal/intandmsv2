import { Module } from '@nestjs/common';
import { MessageHubService } from './message-hub.service';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  controllers: [MessagesController],
  providers: [MessagesService, MessageHubService],
})
export class MessagesModule {}
