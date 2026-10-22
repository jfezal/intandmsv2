import { z } from 'zod';

export const WORKFLOW_MAX_STEPS = 10;
export const WORKFLOW_COMMENT_MAX = 4000;

const uuid = z.string().uuid();
const stepKey = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, 'Step key must be lowercase letters, digits and underscores.');

export const workflowStepAssigneeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user'), userId: uuid }),
  z.object({ type: z.literal('role'), roleId: uuid }),
  z.object({ type: z.literal('department'), departmentId: uuid }),
]);

export const workflowStepSchema = z.object({
  key: stepKey,
  name: z.string().trim().min(1).max(128),
  assignee: workflowStepAssigneeSchema,
});

export const workflowDefinitionBodySchema = z
  .object({
    steps: z.array(workflowStepSchema).min(1).max(WORKFLOW_MAX_STEPS),
  })
  .superRefine((body, context) => {
    const seen = new Set<string>();
    for (const [index, step] of body.steps.entries()) {
      if (seen.has(step.key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate step key "${step.key}".`,
          path: ['steps', index, 'key'],
        });
      }
      seen.add(step.key);
    }
  });

export const createWorkflowDefinitionBodySchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, 'Key must be lowercase letters, digits and underscores.'),
  name: z.string().trim().min(1).max(256),
  definition: workflowDefinitionBodySchema,
});

export const updateWorkflowDefinitionBodySchema = z
  .object({
    name: z.string().trim().min(1).max(256).optional(),
    enabled: z.boolean().optional(),
    definition: workflowDefinitionBodySchema.optional(),
  })
  .refine(
    (body) => body.name !== undefined || body.enabled !== undefined || body.definition !== undefined,
    'Nothing to update.',
  );

export const startReviewBodySchema = z.object({
  definitionId: uuid,
  assignees: z.record(z.string().min(1).max(64), uuid),
});

export const decideTaskBodySchema = z.object({
  decision: z.enum(['approve', 'reject']),
  comment: z.string().trim().max(WORKFLOW_COMMENT_MAX).optional(),
});

export type WorkflowStepAssignee = z.infer<typeof workflowStepAssigneeSchema>;
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type WorkflowDefinitionBody = z.infer<typeof workflowDefinitionBodySchema>;
export type CreateWorkflowDefinitionBody = z.infer<typeof createWorkflowDefinitionBodySchema>;
export type UpdateWorkflowDefinitionBody = z.infer<typeof updateWorkflowDefinitionBodySchema>;
export type StartReviewBody = z.infer<typeof startReviewBodySchema>;
export type DecideTaskBody = z.infer<typeof decideTaskBodySchema>;
