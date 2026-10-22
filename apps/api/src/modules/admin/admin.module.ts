import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [WorkflowModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
