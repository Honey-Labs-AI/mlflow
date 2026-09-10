import { jest, describe, it, expect } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { DesignSystemProvider } from '@databricks/design-system';
import { IntlProvider } from '@databricks/i18n';

import { AssessmentCell } from './rendererFunctions';
import { GenAITracesTableContext } from '../GenAITracesTableContext';
import { ModelTraceExplorerRunJudgesContextProvider } from '../../model-trace-explorer/contexts/RunJudgesContext';
import { createTestAssessmentInfo, createTestTraceInfoV3 } from '../test-fixtures/EvaluatedTraceTestUtils';
import type { EvalTraceComparisonEntry } from '../types';

jest.mock('../../model-trace-explorer/FeatureUtils', () => ({
  shouldUseUnifiedModelTraceComparisonUI: () => false,
  isEvaluatingTracesInDetailsViewEnabled: () => true,
}));

const TRACE_ID = 'trace-abc';
const JUDGE_NAME = 'Safety';

const makeComparisonEntry = (
  traceId: string,
  assessmentsByName: Record<string, any[]> = {},
): EvalTraceComparisonEntry => ({
  currentRunValue: {
    evaluationId: traceId,
    requestId: 'req-1',
    inputsId: traceId,
    inputs: {},
    outputs: {},
    targets: {},
    overallAssessments: [],
    responseAssessmentsByName: assessmentsByName,
    metrics: {},
    traceInfo: createTestTraceInfoV3(traceId, 'req-1', 'Hello', [], 'exp-1'),
  },
});

const renderCell = (
  traceId: string,
  assessmentName: string,
  evaluations: React.ComponentProps<typeof ModelTraceExplorerRunJudgesContextProvider>['evaluations'] = {},
  assessmentsByName: Record<string, any[]> = {},
  dtype: 'pass-fail' | 'boolean' | 'numeric' | 'string' = 'pass-fail',
  otherAssessmentsByName?: Record<string, any[]>,
) => {
  const assessmentInfo = createTestAssessmentInfo(assessmentName, assessmentName, dtype);
  const comparisonEntry = makeComparisonEntry(traceId, assessmentsByName);
  if (otherAssessmentsByName) {
    comparisonEntry.otherRunValue = makeComparisonEntry('other-trace', otherAssessmentsByName).currentRunValue;
  }

  return render(
    <IntlProvider locale="en">
      <DesignSystemProvider>
        <ModelTraceExplorerRunJudgesContextProvider evaluations={evaluations}>
          <GenAITracesTableContext.Provider value={{ isGroupedBySession: false } as any}>
            <AssessmentCell
              isComparing={Boolean(otherAssessmentsByName)}
              assessmentInfo={assessmentInfo}
              comparisonEntry={comparisonEntry}
            />
          </GenAITracesTableContext.Provider>
        </ModelTraceExplorerRunJudgesContextProvider>
      </DesignSystemProvider>
    </IntlProvider>,
  );
};

// The Databricks Spinner renders with this class
const querySpinner = () => document.querySelector('.du-bois-light-spin');

describe('AssessmentCell — judge running spinner', () => {
  it('does not show a spinner when no evaluation is running', () => {
    renderCell(TRACE_ID, JUDGE_NAME, {});
    expect(querySpinner()).not.toBeInTheDocument();
  });

  it('shows a spinner when a matching judge is loading for this trace and column', () => {
    renderCell(TRACE_ID, JUDGE_NAME, {
      'eval-key-1': {
        requestKey: 'eval-key-1',
        label: JUDGE_NAME,
        isLoading: true,
        tracesData: { [TRACE_ID]: {} as any },
      },
    });

    expect(querySpinner()).toBeInTheDocument();
  });

  it('does NOT show a spinner when a different judge (different label) is loading', () => {
    renderCell(TRACE_ID, 'demo', {
      'eval-key-1': {
        requestKey: 'eval-key-1',
        label: JUDGE_NAME, // "Safety" — different from the "demo" column
        isLoading: true,
        tracesData: { [TRACE_ID]: {} as any },
      },
    });

    expect(querySpinner()).not.toBeInTheDocument();
  });

  it('does NOT show a spinner when the trace ID is not in the loading evaluation', () => {
    renderCell(TRACE_ID, JUDGE_NAME, {
      'eval-key-1': {
        requestKey: 'eval-key-1',
        label: JUDGE_NAME,
        isLoading: true,
        tracesData: { 'some-other-trace': {} as any }, // different trace
      },
    });

    expect(querySpinner()).not.toBeInTheDocument();
  });

  it('does NOT show a spinner when the evaluation has finished (isLoading = false)', () => {
    renderCell(TRACE_ID, JUDGE_NAME, {
      'eval-key-1': {
        requestKey: 'eval-key-1',
        label: JUDGE_NAME,
        isLoading: false,
        tracesData: { [TRACE_ID]: {} as any },
      },
    });

    expect(querySpinner()).not.toBeInTheDocument();
  });
});

describe('AssessmentCell — absent assessments and value preservation', () => {
  it('renders absent assessment blank without warning triangle or null text', () => {
    const { container } = renderCell(TRACE_ID, 'unscored_col');
    expect(screen.queryByText(/null/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No assessment for this evaluation/i)).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });

  it.each([
    {
      desc: 'recorded error',
      name: 'col_err',
      dtype: 'string' as const,
      assessment: {
        name: 'col_err',
        errorMessage: 'Check failed',
      },
      expectedText: /Error/i,
    },
    {
      desc: 'recorded false',
      name: 'col_false',
      dtype: 'boolean' as const,
      assessment: {
        name: 'col_false',
        booleanValue: false,
      },
      expectedText: 'False',
    },
    {
      desc: 'recorded numeric 0',
      name: 'col_zero',
      dtype: 'numeric' as const,
      assessment: {
        name: 'col_zero',
        numericValue: 0,
      },
      expectedText: '0',
    },
  ])('preserves $desc', ({ name, dtype, assessment, expectedText }) => {
    renderCell(TRACE_ID, name, {}, { [name]: [assessment] }, dtype);
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });
});

describe('Correctness scorer summary', () => {
  it('shows latest scorer failures, errors and missing results without treating numeric zero as failure', () => {
    renderCell(
      TRACE_ID,
      'correctness',
      {},
      {
        correctness: [{ name: 'correctness', booleanValue: false }],
        answer: [{ name: 'answer', booleanValue: false, rationale: 'Missing total' }],
        association: [{ name: 'association', stringValue: 'no', rationale: 'Missing pair' }],
        latency: [{ name: 'latency', numericValue: 0 }],
        pending: [{ name: 'pending', booleanValue: null }],
        broken: [{ name: 'broken', errorCode: 'ERROR', errorMessage: 'Judge unavailable' }],
        revised: [
          { name: 'revised', booleanValue: false, timestamp: 1, rationale: 'Obsolete failure' },
          { name: 'revised', booleanValue: true, timestamp: 2, rationale: 'Now matched' },
        ],
      },
      'boolean',
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Show scorer summary' }));
    expect(screen.getByText('Missing total')).toBeInTheDocument();
    expect(screen.getByText('Missing pair')).toBeInTheDocument();
    expect(screen.getByText('Judge unavailable')).toBeInTheDocument();
    expect(screen.getByText('pending: Not scored')).toBeInTheDocument();
    expect(screen.getByText('Now matched')).toBeInTheDocument();
    expect(screen.queryByText(/Obsolete failure|latency:/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/: Failed|: Passed|: Error|: Not scored/).map((item) => item.textContent)).toEqual([
      'answer: Failed',
      'association: Failed',
      'broken: Error',
      'pending: Not scored',
      'revised: Passed',
    ]);
  });

  it('keeps every failure before long passing rationales with copy controls outside the results', () => {
    renderCell(
      TRACE_ID,
      'correctness',
      {},
      {
        correctness: [{ name: 'correctness', booleanValue: false }],
        answer_correctness: [
          { name: 'answer_correctness', booleanValue: true, rationale: 'Matched evidence. '.repeat(200) },
        ],
        ...Object.fromEntries(
          Array.from({ length: 8 }, (_, index) => [
            `check_${index}`,
            [{ name: `check_${index}`, booleanValue: false, rationale: `Failure ${index}` }],
          ]),
        ),
        viz_structure: [{ name: 'viz_structure', booleanValue: false, rationale: 'Expected chart(s), got none' }],
      },
      'boolean',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show scorer summary' }));
    expect(screen.getAllByText(/: Failed|: Passed/).map((item) => item.textContent)).toEqual([
      ...Array.from({ length: 8 }, (_, index) => `check_${index}: Failed`),
      'viz_structure: Failed',
      'answer_correctness: Passed',
    ]);
    const body = screen.getByText('Expected chart(s), got none').parentElement?.parentElement;
    expect(body).not.toContainElement(screen.getByRole('button', { name: 'Copy' }));
    expect(body).not.toContainElement(screen.getByRole('button', { name: 'Close' }));
  });

  it('pins on click without opening the row and dismisses with Escape', async () => {
    renderCell(
      TRACE_ID,
      'correctness',
      {},
      {
        correctness: [{ name: 'correctness', booleanValue: false }],
        answer: [{ name: 'answer', booleanValue: false, rationale: 'Missing total' }],
      },
      'boolean',
    );
    const trigger = screen.getByRole('button', { name: 'Show scorer summary' });
    fireEvent.mouseEnter(trigger);
    fireEvent.click(trigger);
    fireEvent.mouseLeave(trigger);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(screen.getByText('Missing total')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Missing total')).not.toBeInTheDocument());
  });
});

it('keeps comparison runs and different scorer sources separate', () => {
  renderCell(
    TRACE_ID,
    'correctness',
    {},
    {
      correctness: [{ name: 'correctness', booleanValue: false }],
      answer: [
        {
          name: 'answer',
          booleanValue: false,
          source: { sourceType: 'CODE', sourceId: 'automatic' },
          rationale: 'Automatic failure',
        },
        {
          name: 'answer',
          booleanValue: true,
          source: { sourceType: 'HUMAN', sourceId: 'reviewer' },
          rationale: 'Human approval',
        },
      ],
    },
    'boolean',
    {
      correctness: [{ name: 'correctness', booleanValue: true }],
      answer: [{ name: 'answer', booleanValue: true, rationale: 'Other run passed' }],
    },
  );
  const buttons = screen.getAllByRole('button', { name: 'Show scorer summary' });
  fireEvent.click(buttons[0]);
  expect(screen.getByText('answer (automatic): Failed')).toBeInTheDocument();
  expect(screen.getByText('answer (reviewer): Passed')).toBeInTheDocument();
  expect(screen.queryByText('Other run passed')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  fireEvent.click(buttons[1]);
  expect(screen.getByText('Other run passed')).toBeInTheDocument();
  expect(screen.queryByText('Automatic failure')).not.toBeInTheDocument();
});
