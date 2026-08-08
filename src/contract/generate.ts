import type { Requirement, TaskContract } from '../domain/schemas.js';
import { unique } from '../utils/text.js';

const AMBIGUOUS_VERBS = new Set([
  'improve',
  'enhance',
  'optimize',
  'update',
  'fix',
  'clean',
  'refactor',
  'better',
]);

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'to',
  'for',
  'of',
  'in',
  'on',
  'with',
  'without',
  'must',
  'should',
  'be',
  'is',
  'it',
  'this',
  'that',
  'existing',
  'requested',
  'remain',
  'function',
  'functional',
  'change',
  'changing',
  'add',
  'create',
  'implement',
]);

export function generateTaskContract(taskInput: string): TaskContract {
  const task = taskInput.trim().replace(/\s+/gu, ' ');
  const ambiguityReasons = detectAmbiguity(task);
  if (ambiguityReasons.length > 0) {
    return {
      task,
      ambiguous: true,
      ambiguityReasons,
      requirements: [],
      approvedAt: null,
      generator: 'deterministic',
    };
  }

  const requirements: Requirement[] = [];
  const withoutMatch = /\bwithout\s+(.+)$/iu.exec(task);
  const mainTask = (
    withoutMatch === null ? task : task.slice(0, withoutMatch.index)
  ).trim();
  const clauses = splitOutcomeClauses(mainTask);

  for (const clause of clauses.slice(0, 4)) {
    addRequirement(requirements, outcomeText(clause), 'outcome');
  }

  if (withoutMatch?.[1] !== undefined) {
    addRequirement(requirements, preservationText(withoutMatch[1]), 'preservation');
  } else {
    addRequirement(
      requirements,
      'Behavior unrelated to the requested task must not be changed unnecessarily.',
      'constraint',
    );
  }

  if (touchesSensitiveArea(task) && requirements.length < 6) {
    addRequirement(
      requirements,
      'No unrelated high-risk security or access-control change may be introduced.',
      'safety',
    );
  }

  return {
    task,
    ambiguous: false,
    ambiguityReasons: [],
    requirements: requirements.slice(0, 6).map((requirement, index) => ({
      ...requirement,
      id: `R${index + 1}`,
      keywords: extractKeywords(requirement.text),
    })),
    approvedAt: null,
    generator: 'deterministic',
  };
}

function detectAmbiguity(task: string): string[] {
  if (task.length < 3) return ['The task is too short to define a verifiable outcome.'];
  const words = task.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
  if (words.length <= 2)
    return ['The task does not describe a specific observable outcome.'];
  const first = words[0];
  if (first !== undefined && AMBIGUOUS_VERBS.has(first) && words.length <= 4) {
    return [
      `“${task}” could refer to behavior, UI, performance, security, or code structure.`,
      'Name the concrete outcome that should be observable when the work is complete.',
    ];
  }
  if (/^(?:make|do)\s+(?:it|this|that)\s+(?:better|work)$/iu.test(task)) {
    return ['The task refers to an outcome without identifying the affected behavior.'];
  }
  return [];
}

function splitOutcomeClauses(task: string): string[] {
  return task
    .split(/\s+(?:and|then)\s+|\s*;\s*/iu)
    .map((part) => part.trim().replace(/[.]+$/u, ''))
    .filter(Boolean);
}

function outcomeText(clause: string): string {
  const addMatch = /^(?:add|create|implement|introduce)\s+(.+)$/iu.exec(clause);
  if (addMatch?.[1] !== undefined) {
    return `${capitalize(addMatch[1])} must be implemented and present in the repository.`;
  }
  const rememberMatch = /^(?:remember|persist|save)\s+(.+)$/iu.exec(clause);
  if (rememberMatch?.[1] !== undefined) {
    return `${capitalize(rememberMatch[1])} must persist as requested.`;
  }
  const preventMatch = /^(?:prevent|disallow|block)\s+(.+)$/iu.exec(clause);
  if (preventMatch?.[1] !== undefined) {
    return `${capitalize(preventMatch[1])} must be prevented.`;
  }
  return `The requested outcome must be implemented: ${lowercaseFirst(clause)}.`;
}

function preservationText(clause: string): string {
  const cleaned = clause
    .replace(/^(?:breaking|changing|removing|weakening|affecting)\s+/iu, '')
    .replace(/[.]+$/u, '')
    .trim();
  return `${capitalize(cleaned)} must remain functional and must not be weakened.`;
}

function addRequirement(
  requirements: Requirement[],
  text: string,
  kind: Requirement['kind'],
): void {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (requirements.some((item) => item.text.toLowerCase() === normalized.toLowerCase()))
    return;
  requirements.push({ id: 'R0', text: normalized, kind, keywords: [] });
}

export function extractKeywords(value: string): string[] {
  const words = value.toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) ?? [];
  return unique(words.filter((word) => !STOP_WORDS.has(word))).slice(0, 12);
}

function touchesSensitiveArea(task: string): boolean {
  return /\b(?:auth|login|password|permission|role|payment|billing|secret|token|crypto|session|security)\w*\b/iu.test(
    task,
  );
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function lowercaseFirst(value: string): string {
  return `${value.charAt(0).toLowerCase()}${value.slice(1)}`;
}
