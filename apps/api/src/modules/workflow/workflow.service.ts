import { Injectable, NotFoundException } from '@nestjs/common';
import { PERMISSIONS } from '@intandms/core';
import { forbidden } from '../../common/forbidden.exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthPrincipal } from '../authorization/authorization.service';
import { AuthorizationService } from '../authorization/authorization.service';

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
  ) {}

  async startReview(principal: AuthPrincipal, documentId: string) {
    if (!this.authz.hasPermission(principal, PERMISSIONS.DOCUMENTS_WRITE)) {
      throw forbidden();
    }

    const document = await this.prisma.client.document.findUnique({
      where: { id: documentId },
      include: { currentVersion: true },
    });
    if (!document?.currentVersion) {
      throw new NotFoundException('Document not found.');
    }

    const definition = await this.prisma.client.workflowDefinition.findUnique({
      where: { key: 'default-review' },
    });
    if (!definition) {
      throw new NotFoundException('Workflow definition missing.');
    }

    const instance = await this.prisma.client.workflowInstance.create({
      data: {
        definitionId: definition.id,
        documentId: document.id,
        documentVersionId: document.currentVersion.id,
        createdByUserId: principal.id,
        tasks: {
          create: {
            stepKey: 'review',
            assigneeUserId: principal.id,
            status: 'pending',
          },
        },
      },
      include: { tasks: true },
    });

    await this.authz.writeAudit(principal, 'workflow.start', 'workflow_instance', instance.id, 'success');
    return instance;
  }

  async decideTask(
    principal: AuthPrincipal,
    taskId: string,
    input: { decision: 'approve' | 'reject'; comment?: string },
  ) {
    const task = await this.prisma.client.workflowTask.findUnique({
      where: { id: taskId },
      include: { instance: true },
    });
    if (!task || task.assigneeUserId !== principal.id) {
      throw forbidden();
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const taskRow = await tx.workflowTask.update({
        where: { id: taskId },
        data: {
          status: 'completed',
          decision: input.decision,
          comment: input.comment,
          completedAt: new Date(),
        },
      });
      await tx.workflowInstance.update({
        where: { id: task.instanceId },
        data: { status: input.decision === 'approve' ? 'approved' : 'rejected' },
      });
      return taskRow;
    });

    await this.authz.writeAudit(principal, 'workflow.decide', 'workflow_task', taskId, 'success', {
      decision: input.decision,
    });
    return updated;
  }

  async myTasks(principal: AuthPrincipal) {
    return this.prisma.client.workflowTask.findMany({
      where: { assigneeUserId: principal.id, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      include: { instance: true },
    });
  }
}
