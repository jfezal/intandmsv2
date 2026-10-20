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
    const document = await this.prisma.client.document.findUnique({
      where: { id: documentId },
      include: { currentVersion: true },
    });
    const location = document ? { repositoryId: document.repositoryId, folderId: document.folderId } : null;
    if (!document?.currentVersion || !location || !(await this.authz.can(principal, PERMISSIONS.DOCUMENTS_READ, location))) {
      throw new NotFoundException('Document not found.');
    }
    await this.authz.assertCan(principal, PERMISSIONS.DOCUMENTS_WRITE, location);

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
    const tasks = await this.prisma.client.workflowTask.findMany({
      where: { assigneeUserId: principal.id, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      include: { instance: { include: { definition: { select: { key: true, name: true } } } } },
    });
    const documentIds = [...new Set(tasks.map((task) => task.instance.documentId))];
    const requesterIds = [...new Set(tasks.map((task) => task.instance.createdByUserId))];
    const [documents, requesters] = await Promise.all([
      documentIds.length
        ? this.prisma.client.document.findMany({
            where: { id: { in: documentIds } },
            select: { id: true, displayName: true, repositoryId: true, folderId: true, repository: { select: { name: true } } },
          })
        : [],
      requesterIds.length
        ? this.prisma.client.user.findMany({
            where: { id: { in: requesterIds } },
            select: { id: true, login: true, displayName: true },
          })
        : [],
    ]);
    const documentById = new Map(documents.map((document) => [document.id, document]));
    const requesterById = new Map(requesters.map((user) => [user.id, user]));
    return tasks.map((task) => {
      const document = documentById.get(task.instance.documentId);
      const requester = requesterById.get(task.instance.createdByUserId);
      return {
        ...task,
        document: document
          ? {
              id: document.id,
              displayName: document.displayName,
              repositoryId: document.repositoryId,
              repositoryName: document.repository.name,
              folderId: document.folderId,
            }
          : null,
        requestedBy: requester ? { login: requester.login, displayName: requester.displayName } : null,
      };
    });
  }
}
