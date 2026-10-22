import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateWorkflowDefinitionBody,
  DecideTaskBody,
  StartReviewBody,
  UpdateWorkflowDefinitionBody,
  WorkflowDefinitionBody,
} from '@intandms/contracts';
import { workflowDefinitionBodySchema } from '@intandms/contracts';
import {
  PERMISSIONS,
  assigneesForSteps,
  filterEligibleReviewers,
  nextStepAfterDecision,
  WorkflowAssignmentError,
  type WorkflowStep,
} from '@intandms/core';
import { Prisma } from '@prisma/client';
import { forbidden } from '../../common/forbidden.exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthPrincipal } from '../authorization/authorization.service';
import { AuthorizationService } from '../authorization/authorization.service';

const USER_SUMMARY = { id: true, login: true, displayName: true, enabled: true } as const;

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
  ) {}

  async listAdmin(principal: AuthPrincipal) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    const rows = await this.prisma.client.workflowDefinition.findMany({ orderBy: { name: 'asc' } });
    return rows.map((row) => this.toAdminDto(row));
  }

  async createDefinition(principal: AuthPrincipal, input: CreateWorkflowDefinitionBody) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    await this.assertAssigneeTargets(input.definition);
    try {
      const created = await this.prisma.client.workflowDefinition.create({
        data: {
          key: input.key,
          name: input.name,
          definition: input.definition as Prisma.InputJsonValue,
        },
      });
      await this.authz.writeAudit(principal, 'workflow.definition.create', 'workflow_definition', created.id, 'success', {
        key: created.key,
      });
      return this.toAdminDto(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A workflow with that key already exists.');
      }
      throw error;
    }
  }

  async updateDefinition(principal: AuthPrincipal, definitionId: string, input: UpdateWorkflowDefinitionBody) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    const existing = await this.prisma.client.workflowDefinition.findUnique({ where: { id: definitionId } });
    if (!existing) throw new NotFoundException('Workflow not found.');
    if (input.definition) await this.assertAssigneeTargets(input.definition);
    const updated = await this.prisma.client.workflowDefinition.update({
      where: { id: definitionId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.definition
          ? { definition: input.definition as Prisma.InputJsonValue, version: { increment: 1 } }
          : {}),
      },
    });
    await this.authz.writeAudit(principal, 'workflow.definition.update', 'workflow_definition', updated.id, 'success');
    return this.toAdminDto(updated);
  }

  async listEnabled(_principal: AuthPrincipal) {
    const rows = await this.prisma.client.workflowDefinition.findMany({
      where: { enabled: true },
      orderBy: { name: 'asc' },
    });
    return rows.flatMap((row) => {
      const definition = this.parseDefinition(row.definition);
      if (definition.steps.length === 0) return [];
      return [
        {
          id: row.id,
          key: row.key,
          name: row.name,
          version: row.version,
          steps: definition.steps.map((step) => ({ key: step.key, name: step.name })),
        },
      ];
    });
  }

  async candidates(principal: AuthPrincipal, documentId: string, definitionId: string) {
    const document = await this.requireWritableDocument(principal, documentId);
    const definition = await this.requireEnabledDefinition(definitionId);
    const snapshot = this.parseDefinition(definition.definition);
    const steps = [];
    for (const step of snapshot.steps) {
      const people = await this.eligiblePeople(document, principal.id, step);
      steps.push({
        key: step.key,
        name: step.name,
        candidates: people.map((user) => ({ id: user.id, login: user.login, displayName: user.displayName })),
      });
    }
    return { definitionId: definition.id, name: definition.name, steps };
  }

  async startReview(principal: AuthPrincipal, documentId: string, input: StartReviewBody) {
    const document = await this.requireWritableDocument(principal, documentId);
    const definition = await this.requireEnabledDefinition(input.definitionId);
    const snapshot = this.parseDefinition(definition.definition);

    const open = await this.prisma.client.workflowInstance.findFirst({
      where: { documentId: document.id, status: 'in_progress' },
      select: { id: true },
    });
    if (open) {
      throw new BadRequestException('This document already has a review in progress.');
    }

    const eligibleByStep: Record<string, string[]> = {};
    for (const step of snapshot.steps) {
      eligibleByStep[step.key] = (await this.eligiblePeople(document, principal.id, step)).map((user) => user.id);
    }

    let assignees: Record<string, string>;
    try {
      assignees = assigneesForSteps(snapshot.steps, input.assignees, eligibleByStep);
    } catch (error) {
      if (error instanceof WorkflowAssignmentError) throw new BadRequestException(error.message);
      throw error;
    }

    const first = snapshot.steps[0];
    if (!first) throw new BadRequestException('This workflow has no steps.');
    const instance = await this.prisma.client.workflowInstance.create({
      data: {
        definitionId: definition.id,
        documentId: document.id,
        documentVersionId: document.currentVersionId,
        createdByUserId: principal.id,
        definitionSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        assignees: assignees as unknown as Prisma.InputJsonValue,
        tasks: {
          create: {
            stepKey: first.key,
            assigneeUserId: assignees[first.key],
            status: 'pending',
          },
        },
      },
      include: { tasks: true },
    });

    await this.authz.writeAudit(principal, 'workflow.start', 'workflow_instance', instance.id, 'success', {
      definitionId: definition.id,
      documentId: document.id,
    });
    return instance;
  }

  async decideTask(principal: AuthPrincipal, taskId: string, input: DecideTaskBody) {
    const task = await this.prisma.client.workflowTask.findUnique({
      where: { id: taskId },
      include: { instance: true },
    });
    if (!task || task.assigneeUserId !== principal.id || task.status !== 'pending') {
      throw forbidden();
    }
    if (task.instance.createdByUserId === principal.id || task.instance.status !== 'in_progress') {
      throw forbidden();
    }

    const snapshot = this.parseDefinition(task.instance.definitionSnapshot);
    const assignees = (task.instance.assignees ?? {}) as Record<string, string>;
    let following: ReturnType<typeof nextStepAfterDecision>;
    try {
      following = nextStepAfterDecision(snapshot.steps, task.stepKey, input.decision);
    } catch (error) {
      if (error instanceof WorkflowAssignmentError) throw new BadRequestException(error.message);
      throw error;
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM workflow_instances WHERE id = ${task.instanceId}::uuid FOR UPDATE`;
      const locked = await tx.workflowTask.findUnique({ where: { id: taskId } });
      if (!locked || locked.status !== 'pending') throw forbidden();

      const taskRow = await tx.workflowTask.update({
        where: { id: taskId },
        data: {
          status: 'completed',
          decision: input.decision,
          comment: input.comment,
          completedAt: new Date(),
        },
      });

      if (following.outcome === 'next') {
        await tx.workflowTask.create({
          data: {
            instanceId: task.instanceId,
            stepKey: following.step.key,
            assigneeUserId: assignees[following.step.key],
            status: 'pending',
          },
        });
      } else {
        await tx.workflowInstance.update({
          where: { id: task.instanceId },
          data: { status: following.outcome },
        });
      }
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
      include: {
        instance: {
          include: {
            definition: { select: { key: true, name: true } },
            tasks: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });
    const documentIds = [...new Set(tasks.map((task) => task.instance.documentId))];
    const requesterIds = [...new Set(tasks.map((task) => task.instance.createdByUserId))];
    const assigneeIds = [
      ...new Set(tasks.flatMap((task) => task.instance.tasks.map((item) => item.assigneeUserId).filter((id): id is string => Boolean(id)))),
    ];
    const [documents, users] = await Promise.all([
      documentIds.length
        ? this.prisma.client.document.findMany({
            where: { id: { in: documentIds } },
            select: { id: true, displayName: true, repositoryId: true, folderId: true, repository: { select: { name: true } } },
          })
        : [],
      [...new Set([...requesterIds, ...assigneeIds])].length
        ? this.prisma.client.user.findMany({
            where: { id: { in: [...new Set([...requesterIds, ...assigneeIds])] } },
            select: USER_SUMMARY,
          })
        : [],
    ]);
    const documentById = new Map(documents.map((document) => [document.id, document]));
    const userById = new Map(users.map((user) => [user.id, user]));
    return tasks.map((task) => {
      const document = documentById.get(task.instance.documentId);
      const requester = userById.get(task.instance.createdByUserId);
      const snapshot = this.parseDefinition(task.instance.definitionSnapshot);
      const stepIndex = Math.max(0, snapshot.steps.findIndex((step) => step.key === task.stepKey));
      return {
        id: task.id,
        stepKey: task.stepKey,
        status: task.status,
        createdAt: task.createdAt,
        dueAt: task.dueAt,
        instance: {
          documentId: task.instance.documentId,
          documentVersionId: task.instance.documentVersionId,
          status: task.instance.status,
          definition: task.instance.definition,
          stepIndex,
          stepCount: snapshot.steps.length,
          history: task.instance.tasks
            .filter((item) => item.status === 'completed')
            .map((item) => {
              const step = snapshot.steps.find((entry) => entry.key === item.stepKey);
              const assignee = item.assigneeUserId ? userById.get(item.assigneeUserId) : undefined;
              return {
                stepKey: item.stepKey,
                stepName: step?.name ?? item.stepKey,
                decision: item.decision,
                comment: item.comment,
                completedAt: item.completedAt,
                assignee: assignee ? { login: assignee.login, displayName: assignee.displayName } : null,
              };
            }),
        },
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

  private toAdminDto(row: {
    id: string;
    key: string;
    name: string;
    version: number;
    enabled: boolean;
    definition: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      version: row.version,
      enabled: row.enabled,
      definition: this.parseDefinition(row.definition),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private parseDefinition(value: Prisma.JsonValue): WorkflowDefinitionBody {
    const parsed = workflowDefinitionBodySchema.safeParse(value);
    if (!parsed.success) {
      return { steps: [] };
    }
    return parsed.data;
  }

  private async requireEnabledDefinition(definitionId: string) {
    const definition = await this.prisma.client.workflowDefinition.findUnique({ where: { id: definitionId } });
    if (!definition || !definition.enabled) throw new NotFoundException('Workflow not found.');
    const snapshot = this.parseDefinition(definition.definition);
    if (snapshot.steps.length === 0) throw new BadRequestException('This workflow has no steps.');
    return definition;
  }

  private async requireWritableDocument(principal: AuthPrincipal, documentId: string) {
    const document = await this.prisma.client.document.findUnique({
      where: { id: documentId },
      include: { currentVersion: true },
    });
    const location = document ? { repositoryId: document.repositoryId, folderId: document.folderId } : null;
    if (!document || !location || !(await this.authz.can(principal, PERMISSIONS.DOCUMENTS_READ, location))) {
      throw new NotFoundException('Document not found.');
    }
    if (!document.currentVersion) {
      throw new BadRequestException('This document has no version to pin for review.');
    }
    await this.authz.assertCan(principal, PERMISSIONS.DOCUMENTS_WRITE, location);
    return { ...document, currentVersionId: document.currentVersion.id };
  }

  private async assertAssigneeTargets(definition: WorkflowDefinitionBody) {
    const userIds = definition.steps.flatMap((step) => (step.assignee.type === 'user' ? [step.assignee.userId] : []));
    const roleIds = definition.steps.flatMap((step) => (step.assignee.type === 'role' ? [step.assignee.roleId] : []));
    const departmentIds = definition.steps.flatMap((step) =>
      step.assignee.type === 'department' ? [step.assignee.departmentId] : [],
    );
    if (userIds.length) {
      const count = await this.prisma.client.user.count({ where: { id: { in: [...new Set(userIds)] } } });
      if (count !== new Set(userIds).size) throw new NotFoundException('User not found.');
    }
    if (roleIds.length) {
      const count = await this.prisma.client.role.count({ where: { id: { in: [...new Set(roleIds)] } } });
      if (count !== new Set(roleIds).size) throw new NotFoundException('Role not found.');
    }
    if (departmentIds.length) {
      const count = await this.prisma.client.department.count({ where: { id: { in: [...new Set(departmentIds)] } } });
      if (count !== new Set(departmentIds).size) throw new NotFoundException('Department not found.');
    }
  }

  private async eligiblePeople(
    document: { repositoryId: string; folderId: string | null },
    requesterId: string,
    step: WorkflowStep,
  ) {
    const poolIds = await this.poolUserIds(document, step);
    if (poolIds.length === 0) return [];
    const users = await this.prisma.client.user.findMany({
      where: { id: { in: poolIds } },
      select: {
        ...USER_SUMMARY,
        userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
      },
    });
    const eligibleIds = [];
    for (const user of users) {
      const permissions = [
        ...new Set(
          user.userRoles.flatMap((userRole) =>
            userRole.role.rolePermissions.map((rolePermission) => rolePermission.permission.key),
          ),
        ),
      ];
      const canRead = await this.authz.can(
        { id: user.id, login: user.login, permissions },
        PERMISSIONS.DOCUMENTS_READ,
        { repositoryId: document.repositoryId, folderId: document.folderId },
      );
      if (filterEligibleReviewers(requesterId, [{ id: user.id, enabled: user.enabled, canRead }]).length) {
        eligibleIds.push(user);
      }
    }
    return eligibleIds.sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  private async poolUserIds(
    document: { repositoryId: string; folderId: string | null },
    step: WorkflowStep,
  ): Promise<string[]> {
    if (step.assignee.type === 'user') return [step.assignee.userId];
    if (step.assignee.type === 'department') {
      const members = await this.prisma.client.departmentMember.findMany({
        where: { departmentId: step.assignee.departmentId },
        select: { userId: true },
      });
      return members.map((member) => member.userId);
    }

    const ancestry = (await this.authz.folderAncestry(document.repositoryId, document.folderId)) ?? [];
    const [globalHolders, scoped] = await Promise.all([
      this.prisma.client.userRole.findMany({ where: { roleId: step.assignee.roleId }, select: { userId: true } }),
      this.prisma.client.scopedRoleAssignment.findMany({
        where: {
          roleId: step.assignee.roleId,
          repositoryId: document.repositoryId,
          OR: [{ folderId: null }, ...(ancestry.length ? [{ folderId: { in: ancestry } }] : [])],
        },
        select: { userId: true, departmentId: true },
      }),
    ]);
    const departmentIds = [...new Set(scoped.map((row) => row.departmentId).filter((id): id is string => Boolean(id)))];
    const departmentMembers = departmentIds.length
      ? await this.prisma.client.departmentMember.findMany({
          where: { departmentId: { in: departmentIds } },
          select: { userId: true },
        })
      : [];
    return [
      ...new Set([
        ...globalHolders.map((row) => row.userId),
        ...scoped.map((row) => row.userId).filter((id): id is string => Boolean(id)),
        ...departmentMembers.map((row) => row.userId),
      ]),
    ];
  }
}
