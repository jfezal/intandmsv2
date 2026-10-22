export type WorkflowStepAssignee =
  | { type: 'user'; userId: string }
  | { type: 'role'; roleId: string }
  | { type: 'department'; departmentId: string };

export type WorkflowStep = {
  key: string;
  name: string;
  assignee: WorkflowStepAssignee;
};

export type WorkflowDefinitionSnapshot = { steps: WorkflowStep[] };

export type WorkflowCandidate = { id: string; enabled: boolean; canRead: boolean };

export class WorkflowAssignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowAssignmentError';
  }
}

/** Active users who can read the document, excluding the person who submitted the review. */
export function filterEligibleReviewers(requesterId: string, candidates: readonly WorkflowCandidate[]): string[] {
  return candidates
    .filter((candidate) => candidate.enabled && candidate.canRead && candidate.id !== requesterId)
    .map((candidate) => candidate.id);
}

export function assigneesForSteps(
  steps: readonly WorkflowStep[],
  assignees: Record<string, string>,
  eligibleByStep: Record<string, readonly string[]>,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const step of steps) {
    const chosen = assignees[step.key];
    const eligible = eligibleByStep[step.key] ?? [];
    if (eligible.length === 0) {
      throw new WorkflowAssignmentError(`No eligible reviewer for step "${step.name}".`);
    }
    if (!chosen) {
      throw new WorkflowAssignmentError(`Choose a reviewer for step "${step.name}".`);
    }
    if (!eligible.includes(chosen)) {
      throw new WorkflowAssignmentError(`The chosen reviewer is not eligible for step "${step.name}".`);
    }
    resolved[step.key] = chosen;
  }
  return resolved;
}

export function stepByKey(steps: readonly WorkflowStep[], key: string): WorkflowStep | undefined {
  return steps.find((step) => step.key === key);
}

export function nextStepAfterDecision(
  steps: readonly WorkflowStep[],
  currentStepKey: string,
  decision: 'approve' | 'reject',
): { outcome: 'approved' } | { outcome: 'rejected' } | { outcome: 'next'; step: WorkflowStep } {
  if (decision === 'reject') return { outcome: 'rejected' };
  const index = steps.findIndex((step) => step.key === currentStepKey);
  if (index < 0) {
    throw new WorkflowAssignmentError('Unknown workflow step.');
  }
  const following = steps[index + 1];
  if (!following) return { outcome: 'approved' };
  return { outcome: 'next', step: following };
}
