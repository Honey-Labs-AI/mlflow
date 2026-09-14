import React, { useMemo, useState } from 'react';
import {
  useDesignSystemTheme,
  ParagraphSkeleton,
  PlusIcon,
  CodeIcon,
  Spacer,
  SplitButton,
  DropdownMenu,
  CursorPagination,
  Alert,
} from '@databricks/design-system';
import { FormattedMessage, useIntl } from '@databricks/i18n';
import ScorerCardContainer from './ScorerCardContainer';
import ScorerModalRenderer from './ScorerModalRenderer';
import ScorerEmptyStateRenderer from './ScorerEmptyStateRenderer';
import { GitManagedScorerCard } from './GitManagedScorerCard';
import { shouldPaginateScorers } from '../../../common/utils/FeatureUtils';
import { useGetScheduledScorers } from './hooks/useGetScheduledScorers';
import { useGetExperimentQuery } from '../../hooks/useExperimentQuery';
import { parseGitManagedJudgesTag, GIT_MANAGED_JUDGES_TAG } from './gitManagedJudgesUtils';
import { SCORER_FORM_MODE } from './constants';
import type { ScorerFormData } from './utils/scorerTransformUtils';

interface ExperimentScorersContentContainerProps {
  experimentId: string;
}

const ExperimentScorersContentContainer: React.FC<ExperimentScorersContentContainerProps> = ({ experimentId }) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [initialScorerType, setInitialScorerType] = useState<ScorerFormData['scorerType']>('llm');
  const scheduledScorersResult = useGetScheduledScorers(experimentId);
  const scorers = scheduledScorersResult.data?.scheduledScorers || [];
  const { data: experiment, loading: isExperimentLoading } = useGetExperimentQuery({ experimentId });

  const gitManagedJudgesTag = experiment?.tags?.find((tag) => tag.key === GIT_MANAGED_JUDGES_TAG)?.value;

  const { judges: gitJudges, error: catalogError } = useMemo(
    () => parseGitManagedJudgesTag(gitManagedJudgesTag, experiment?.tags),
    [gitManagedJudgesTag, experiment?.tags],
  );

  const isLoading = scheduledScorersResult.isLoading || isExperimentLoading;
  const isError = scheduledScorersResult.isError;
  const error = scheduledScorersResult.error;

  const handleNewLLMScorerClick = () => {
    setInitialScorerType('llm');
    setIsModalVisible(true);
  };

  const handleNewCustomCodeScorerClick = () => {
    setInitialScorerType('custom-code');
    setIsModalVisible(true);
  };

  // If no native or git-managed scorers exist and no catalog error and we're not currently showing the modal, show empty state
  const hasAnyJudges = scorers.length > 0 || gitJudges.length > 0;
  const shouldShowEmptyState = !hasAnyJudges && !catalogError && !isModalVisible && !isLoading;

  const closeModal = () => {
    setIsModalVisible(false);
  };

  // Handle error state - throw error to be caught by PanelBoundary
  if (isError && error) {
    throw error;
  }

  // Handle loading state
  if (isLoading) {
    return (
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          gap: theme.spacing.sm,
          padding: theme.spacing.lg,
        }}
      >
        {[...Array(3).keys()].map((i) => (
          <ParagraphSkeleton
            label={intl.formatMessage({
              defaultMessage: 'Loading judges...',
              description: 'Loading message while fetching experiment judges',
            })}
            key={i}
            seed={`scorer-${i}`}
          />
        ))}
      </div>
    );
  }

  // Show empty state when there are no scorers
  if (shouldShowEmptyState) {
    return (
      <ScorerEmptyStateRenderer
        onAddLLMScorerClick={handleNewLLMScorerClick}
        onAddCustomCodeScorerClick={handleNewCustomCodeScorerClick}
      />
    );
  }

  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'auto',
      }}
    >
      {/* Header with New judge split button */}
      <div
        css={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: theme.spacing.sm,
        }}
      >
        <SplitButton
          type="primary"
          icon={<PlusIcon />}
          componentId="mlflow.experiment-scorers.new-scorer-button"
          onClick={handleNewLLMScorerClick}
          menu={
            <DropdownMenu.Content>
              <DropdownMenu.Item
                componentId="mlflow.experiment-scorers.new-custom-code-scorer-menu-item"
                onClick={handleNewCustomCodeScorerClick}
                css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}
              >
                <CodeIcon />
                <FormattedMessage
                  defaultMessage="Custom code judge"
                  description="Menu item text to create a new custom code judge"
                />
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          }
        >
          <FormattedMessage defaultMessage="New LLM judge" description="Button text to create a new LLM judge" />
        </SplitButton>
      </div>
      <Spacer size="sm" />
      {/* Malformed Git-managed catalog alert */}
      {catalogError && (
        <div css={{ padding: `${theme.spacing.xs}px ${theme.spacing.sm}px`, marginBottom: theme.spacing.sm }}>
          <Alert
            componentId="mlflow.experiment-scorers.invalid-git-catalog-alert"
            data-testid="invalid-git-catalog-alert"
            type="error"
            message={
              <FormattedMessage
                defaultMessage="Invalid Git-managed judges catalog"
                description="Error message when Git-managed judges catalog tag is malformed"
              />
            }
            description={
              <FormattedMessage
                defaultMessage="The experiment tag mlflow.ui.judges.gitManaged contains invalid or malformed data: {error}. Native judges are preserved."
                description="Error description when Git-managed judges catalog tag is malformed"
                values={{ error: catalogError }}
              />
            }
            closable={false}
          />
        </div>
      )}
      {/* Content area */}
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          css={{
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.sm,
            width: '100%',
          }}
        >
          {scorers.map((scorer) => (
            <ScorerCardContainer key={scorer.name} scorer={scorer} experimentId={experimentId} />
          ))}
          {gitJudges.map((judge) => (
            <GitManagedScorerCard key={`git-${judge.name}`} judge={judge} />
          ))}
        </div>
      </div>
      {/* New Scorer Modal */}
      <ScorerModalRenderer
        visible={isModalVisible}
        onClose={closeModal}
        experimentId={experimentId}
        mode={SCORER_FORM_MODE.CREATE}
        initialScorerType={initialScorerType}
      />
    </div>
  );
};

export default ExperimentScorersContentContainer;
