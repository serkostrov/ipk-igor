/**
 * Shared fixtures for TS ↔ SQL `automation_conditions_match` parity.
 * Keep cases in sync with SQL semantics in the automation_core migration.
 * Run against both evaluators when a test runner is available.
 */

import type { AutomationConditions } from "../model/conditions";
import { matchAutomationConditions } from "./evaluate-conditions";

export type ConditionParityCase = {
  id: string;
  conditions: AutomationConditions;
  values: Record<string, string>;
  previousValues?: Record<string, string>;
  expected: boolean;
};

export const AUTOMATION_CONDITION_PARITY_CASES: ConditionParityCase[] = [
  {
    id: "empty-rules-match",
    conditions: { version: 1, match: "all", rules: [] },
    values: {},
    expected: true,
  },
  {
    id: "all-equals",
    conditions: {
      version: 1,
      match: "all",
      rules: [
        {
          kind: "rule",
          id: "r1",
          fieldId: "status",
          operator: "equals",
          value: "open",
        },
      ],
    },
    values: { status: "open" },
    expected: true,
  },
  {
    id: "all-equals-fail",
    conditions: {
      version: 1,
      match: "all",
      rules: [
        {
          kind: "rule",
          id: "r1",
          fieldId: "status",
          operator: "equals",
          value: "open",
        },
      ],
    },
    values: { status: "closed" },
    expected: false,
  },
  {
    id: "any-group",
    conditions: {
      version: 1,
      match: "all",
      rules: [
        {
          kind: "group",
          id: "g1",
          match: "any",
          rules: [
            {
              kind: "rule",
              id: "r1",
              fieldId: "a",
              operator: "equals",
              value: "1",
            },
            {
              kind: "rule",
              id: "r2",
              fieldId: "b",
              operator: "equals",
              value: "2",
            },
          ],
        },
      ],
    },
    values: { a: "0", b: "2" },
    expected: true,
  },
  {
    id: "field-transition",
    conditions: {
      version: 1,
      match: "all",
      rules: [
        {
          kind: "rule",
          id: "r1",
          fieldId: "stage",
          operator: "fieldTransition",
          value: JSON.stringify({ from: "a", to: "b" }),
        },
      ],
    },
    values: { stage: "b" },
    previousValues: { stage: "a" },
    expected: true,
  },
  {
    id: "field-changed",
    conditions: {
      version: 1,
      match: "all",
      rules: [
        {
          kind: "rule",
          id: "r1",
          fieldId: "stage",
          operator: "fieldChanged",
        },
      ],
    },
    values: { stage: "b" },
    previousValues: { stage: "a" },
    expected: true,
  },
  {
    id: "empty-operator",
    conditions: {
      version: 1,
      match: "all",
      rules: [
        {
          kind: "rule",
          id: "r1",
          fieldId: "note",
          operator: "empty",
        },
      ],
    },
    values: { note: "" },
    expected: true,
  },
  {
    id: "folder-has-files",
    conditions: {
      version: 1,
      match: "all",
      rules: [
        {
          kind: "rule",
          id: "r1",
          fieldId: "__tab_files__:tab-docs",
          operator: "folderHasFiles",
          value: "Договоры",
        },
      ],
    },
    values: {
      "__tab_files__:tab-docs": JSON.stringify([
        {
          id: "f1",
          name: "Договоры",
          kind: "folder",
          parentId: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "file1",
          name: "a.pdf",
          kind: "file",
          parentId: "f1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ]),
    },
    expected: true,
  },
  {
    id: "folder-empty",
    conditions: {
      version: 1,
      match: "all",
      rules: [
        {
          kind: "rule",
          id: "r1",
          fieldId: "__tab_files__:tab-docs",
          operator: "folderEmpty",
          value: "Договоры",
        },
      ],
    },
    values: {
      "__tab_files__:tab-docs": JSON.stringify([
        {
          id: "f1",
          name: "Договоры",
          kind: "folder",
          parentId: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ]),
    },
    expected: true,
  },
];

/** Evaluate all fixtures with the TS matcher (smoke / CI helper). */
export function runAutomationConditionParityTs(): Array<{
  id: string;
  ok: boolean;
  expected: boolean;
  actual: boolean;
}> {
  return AUTOMATION_CONDITION_PARITY_CASES.map((item) => {
    const actual = matchAutomationConditions(item.conditions, {
      values: item.values,
      previousValues: item.previousValues,
    });
    return {
      id: item.id,
      ok: actual === item.expected,
      expected: item.expected,
      actual,
    };
  });
}
