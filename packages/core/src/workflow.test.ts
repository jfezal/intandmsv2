import { describe, expect, it } from 'vitest';
import {
  assigneesForSteps,
  filterEligibleReviewers,
  nextStepAfterDecision,
  WorkflowAssignmentError,
  type WorkflowStep,
} from './workflow';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const steps: WorkflowStep[] = [
  { key: 'review', name: 'Review', assignee: { type: 'role', roleId: A } },
  { key: 'approve', name: 'Approve', assignee: { type: 'user', userId: C } },
];

describe('filterEligibleReviewers', () => {
  it('keeps enabled readers who are not the requester', () => {
    expect(
      filterEligibleReviewers(A, [
        { id: A, enabled: true, canRead: true },
        { id: B, enabled: true, canRead: true },
        { id: C, enabled: false, canRead: true },
        { id: 'd', enabled: true, canRead: false },
      ]),
    ).toEqual([B]);
  });
});

describe('assigneesForSteps', () => {
  it('accepts one eligible person per step', () => {
    expect(
      assigneesForSteps(steps, { review: B, approve: C }, { review: [B], approve: [C] }),
    ).toEqual({ review: B, approve: C });
  });

  it('refuses an empty pool, a missing pick, or someone outside the pool', () => {
    expect(() => assigneesForSteps(steps, { review: B, approve: C }, { review: [], approve: [C] })).toThrow(
      WorkflowAssignmentError,
    );
    expect(() => assigneesForSteps(steps, { approve: C }, { review: [B], approve: [C] })).toThrow(WorkflowAssignmentError);
    expect(() => assigneesForSteps(steps, { review: A, approve: C }, { review: [B], approve: [C] })).toThrow(
      WorkflowAssignmentError,
    );
  });
});

describe('nextStepAfterDecision', () => {
  it('opens the next step after an approval', () => {
    expect(nextStepAfterDecision(steps, 'review', 'approve')).toEqual({ outcome: 'next', step: steps[1] });
  });

  it('completes the instance on the last approval', () => {
    expect(nextStepAfterDecision(steps, 'approve', 'approve')).toEqual({ outcome: 'approved' });
  });

  it('rejects the instance and does not open later steps', () => {
    expect(nextStepAfterDecision(steps, 'review', 'reject')).toEqual({ outcome: 'rejected' });
  });
});
