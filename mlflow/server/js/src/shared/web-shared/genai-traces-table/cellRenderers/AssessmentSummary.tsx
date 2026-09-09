import { useEffect, useRef, useState } from 'react';
import { Button, Popover, Typography, useDesignSystemTheme } from '@databricks/design-system';
import { useIntl } from '@databricks/i18n';
import { CopyActionButton } from '../../copy/CopyActionButton';
import {
  getEvaluationResultAssessmentValue,
  KnownEvaluationResultAssessmentName,
  KnownEvaluationResultAssessmentStringValue,
} from '../components/GenAiEvaluationTracesReview.utils';
import { EvaluationsReviewAssessmentTag } from '../components/EvaluationsReviewAssessmentTag';
import type { AssessmentInfo, RunEvaluationResultAssessment, RunEvaluationTracesDataEntry } from '../types';

export const AssessmentSummary = ({
  assessment,
  assessmentInfo,
  run,
}: {
  assessment: RunEvaluationResultAssessment;
  assessmentInfo: AssessmentInfo;
  run: RunEvaluationTracesDataEntry;
}) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const [mode, setMode] = useState<'closed' | 'hover' | 'pinned'>('closed');
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const cancelClose = () => clearTimeout(closeTimer.current);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const preview = () => {
    cancelClose();
    setMode((current) => (current === 'closed' ? 'hover' : current));
  };
  const leave = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setMode((current) => (current === 'hover' ? 'closed' : current)), 200);
  };
  const labels = {
    failed: intl.formatMessage({ defaultMessage: 'Failed', description: 'Failed scorer in assessment summary' }),
    passed: intl.formatMessage({ defaultMessage: 'Passed', description: 'Passed scorer in assessment summary' }),
    error: intl.formatMessage({ defaultMessage: 'Error', description: 'Scorer error in assessment summary' }),
    missing: intl.formatMessage({
      defaultMessage: 'Not scored',
      description: 'Missing scorer result in assessment summary',
    }),
  };
  const rows = Object.entries(run.responseAssessmentsByName)
    .flatMap(([name, assessments]) => {
      if (name === KnownEvaluationResultAssessmentName.CORRECTNESS) return [];
      const latest = new Map<string, RunEvaluationResultAssessment>();
      for (const entry of assessments) {
        const source = JSON.stringify([entry.source?.sourceType, entry.source?.sourceId]);
        const previous = latest.get(source);
        if (!previous || (entry.timestamp ?? 0) > (previous.timestamp ?? 0)) latest.set(source, entry);
      }
      return Array.from(latest.values()).flatMap((entry) => {
        const value = getEvaluationResultAssessmentValue(entry);
        const status: keyof typeof labels | undefined =
          entry.errorCode || entry.errorMessage
            ? 'error'
            : value === false || value === KnownEvaluationResultAssessmentStringValue.NO
              ? 'failed'
              : value === true || value === KnownEvaluationResultAssessmentStringValue.YES
                ? 'passed'
                : value == null
                  ? 'missing'
                  : undefined;
        if (!status) return [];
        return [
          {
            name,
            source: latest.size > 1 ? entry.source?.sourceId : undefined,
            status,
            rationale: entry.errorMessage || entry.rationale || entry.errorCode || '',
          },
        ];
      });
    })
    .sort((left, right) => {
      const order: Record<string, number> = { failed: 0, error: 1, missing: 2, passed: 3 };
      return order[left.status] - order[right.status] || left.name.localeCompare(right.name);
    });
  const summary = [
    `${assessmentInfo.displayName}: ${getEvaluationResultAssessmentValue(assessment) ?? labels.missing}`,
    assessment.errorMessage || assessment.rationale,
    ...rows.map(
      (row) =>
        `${row.name}${row.source ? ` (${row.source})` : ''}: ${labels[row.status]}${row.rationale ? ` — ${row.rationale}` : ''}`,
    ),
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <Popover.Root
      componentId="mlflow.assessment-summary"
      open={mode !== 'closed'}
      onOpenChange={(open) => {
        cancelClose();
        setMode(open ? 'pinned' : 'closed');
      }}
    >
      <Popover.Trigger asChild>
        <Button
          componentId="mlflow.assessment-summary.trigger"
          type="tertiary"
          size="small"
          aria-label={intl.formatMessage({
            defaultMessage: 'Show scorer summary',
            description: 'Open assessment summary button label',
          })}
          onMouseEnter={preview}
          onMouseLeave={leave}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            cancelClose();
            setMode('pinned');
          }}
          css={{ padding: 0, height: 'auto' }}
        >
          <EvaluationsReviewAssessmentTag
            assessment={assessment}
            assessmentInfo={assessmentInfo}
            type="value"
            disableTooltip
            disableJudgeTypeIcon
            hideAssessmentName
          />
        </Button>
      </Popover.Trigger>
      <Popover.Content
        side="bottom"
        align="start"
        maxWidth={560}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={cancelClose}
        onMouseLeave={leave}
        onPointerDown={() => {
          cancelClose();
          setMode('pinned');
        }}
        onClick={(event) => event.stopPropagation()}
        onKeyDownCapture={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            cancelClose();
            setMode('closed');
          }
        }}
        css={{ userSelect: 'text', maxHeight: '70vh', overflowY: 'auto', padding: theme.spacing.md }}
      >
        <div css={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.md }}>
          <Typography.Text bold>{assessmentInfo.displayName}</Typography.Text>
          <div css={{ display: 'flex', gap: theme.spacing.xs }}>
            <CopyActionButton
              copyText={summary}
              componentId="mlflow.assessment-summary.copy"
              onCopy={() => setMode('pinned')}
            />
            <Popover.Close asChild>
              <Button componentId="mlflow.assessment-summary.close" size="small" type="tertiary">
                {intl.formatMessage({ defaultMessage: 'Close', description: 'Close assessment summary button' })}
              </Button>
            </Popover.Close>
          </div>
        </div>
        <div
          css={{
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.md,
            marginTop: theme.spacing.sm,
            overflowWrap: 'anywhere',
          }}
        >
          <Typography.Text>{summary.split('\n')[0]}</Typography.Text>
          {(assessment.errorMessage || assessment.rationale) && (
            <div>{assessment.errorMessage || assessment.rationale}</div>
          )}
          {rows.map((row, index) => (
            <div key={index}>
              <Typography.Text
                bold
                css={{
                  color:
                    row.status === 'failed'
                      ? theme.colors.textValidationDanger
                      : row.status === 'error'
                        ? theme.colors.textValidationWarning
                        : undefined,
                }}
              >
                {row.name}
                {row.source ? ` (${row.source})` : ''}: {labels[row.status]}
              </Typography.Text>
              {row.rationale && <div css={{ whiteSpace: 'pre-wrap' }}>{row.rationale}</div>}
            </div>
          ))}
        </div>
        <Typography.Hint css={{ marginTop: theme.spacing.sm }}>
          {intl.formatMessage({
            defaultMessage: 'Click to keep open. Escape or click outside to close.',
            description: 'Assessment summary interaction hint',
          })}
        </Typography.Hint>
      </Popover.Content>
    </Popover.Root>
  );
};
