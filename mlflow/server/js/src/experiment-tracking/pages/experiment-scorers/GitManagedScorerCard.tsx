import React, { useState } from 'react';
import {
  useDesignSystemTheme,
  Typography,
  Tag,
  Button,
  Card,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleIcon,
  BranchIcon,
  CodeIcon,
  CopyIcon,
} from '@databricks/design-system';
import { FormattedMessage, useIntl } from '@databricks/i18n';
import { CodeSnippet } from '@databricks/web-shared/snippet';
import { CopyButton } from '@mlflow/mlflow/src/shared/building_blocks/CopyButton';
import type { GitManagedJudge } from './types';

interface CodeBlockWithCopyProps {
  code: string;
  language: 'python' | 'json';
  theme: any;
}

const CodeBlockWithCopy: React.FC<CodeBlockWithCopyProps> = ({ code, language, theme }) => {
  return (
    <div
      css={{
        position: 'relative',
        maxWidth: '100%',
        maxHeight: '400px',
        overflow: 'auto',
        border: `1px solid ${theme.colors.borderDecorative}`,
        borderRadius: theme.borders.borderRadiusMd,
      }}
    >
      <CopyButton
        css={{
          zIndex: 1,
          position: 'sticky',
          float: 'right',
          top: theme.spacing.xs,
          right: theme.spacing.xs,
        }}
        showLabel={false}
        copyText={code}
        icon={<CopyIcon />}
      />
      <CodeSnippet
        language={language}
        theme={theme.isDarkMode ? 'duotoneDark' : 'light'}
        style={{ padding: theme.spacing.sm, margin: 0, minWidth: '100%' }}
      >
        {code}
      </CodeSnippet>
    </div>
  );
};

export interface GitManagedScorerCardProps {
  judge: GitManagedJudge;
}

export const GitManagedScorerCard: React.FC<GitManagedScorerCardProps> = ({ judge }) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const [isExpanded, setIsExpanded] = useState(false);
  const detailsId = `git-judge-details-${judge.name}`;

  return (
    <Card
      componentId="mlflow.experiment-scorers.git-judge-card"
      data-testid={`git-managed-judge-card-${judge.name}`}
      css={{
        padding: theme.spacing.md,
        position: 'relative',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Header with expand button, title, tags and metadata */}
      <div
        css={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          gap: theme.spacing.xs,
          alignItems: 'flex-start',
        }}
      >
        <Button
          componentId="mlflow.experiment-scorers.git-judge-expand-button"
          data-testid="git-judge-expand-button"
          aria-label={intl.formatMessage(
            {
              defaultMessage: 'Toggle details for {judgeName}',
              description: 'Accessibility label to expand or collapse details for Git-managed judge',
            },
            { judgeName: judge.name },
          )}
          aria-expanded={isExpanded}
          aria-controls={detailsId}
          icon={isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          size="small"
          type="tertiary"
          onClick={() => setIsExpanded(!isExpanded)}
          css={{
            padding: theme.spacing.xs,
          }}
        />
        <div css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs, minWidth: 0 }}>
          <div css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
            <Typography.Title level={4} css={{ margin: 0, marginBottom: '0 !important' }}>
              {judge.name}
            </Typography.Title>
            <Tag
              componentId="mlflow.experiment-scorers.git-judge-status-tag"
              data-testid="git-managed-status-tag"
              color="indigo"
              icon={<BranchIcon />}
            >
              <FormattedMessage defaultMessage="Git-managed" description="Status tag for Git-managed judge" />
            </Tag>
            <Tag
              componentId="mlflow.experiment-scorers.git-judge-kind-tag"
              data-testid="git-managed-kind-tag"
              color="teal"
              icon={<CodeIcon />}
            >
              {judge.kind}
            </Tag>
          </div>

          {judge.description && (
            <Typography.Paragraph
              data-testid="git-managed-description"
              css={{
                margin: 0,
                marginTop: theme.spacing.xs,
                color: theme.colors.textSecondary,
              }}
            >
              {judge.description}
            </Typography.Paragraph>
          )}

          <div
            css={{
              display: 'flex',
              gap: theme.spacing.sm,
              alignItems: 'center',
              flexWrap: 'wrap',
              marginTop: theme.spacing.xs,
            }}
          >
            <div css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, minWidth: 0 }}>
              <Typography.Hint>
                <FormattedMessage defaultMessage="Path:" description="Label for Git judge source path" />
              </Typography.Hint>
              <Typography.Hint
                data-testid="git-managed-source-path"
                css={{ fontFamily: 'monospace', wordBreak: 'break-all', maxWidth: '100%' }}
              >
                {judge.source_path}
              </Typography.Hint>
            </div>
            <CircleIcon css={{ color: theme.colors.textSecondary, fontSize: '6px', flexShrink: 0 }} />
            <div css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, minWidth: 0 }}>
              <Typography.Hint>
                <FormattedMessage defaultMessage="Hash:" description="Label for Git judge source SHA256" />
              </Typography.Hint>
              <Typography.Hint
                data-testid="git-managed-source-hash"
                css={{ fontFamily: 'monospace', wordBreak: 'break-all', maxWidth: '100%' }}
                title={judge.source_sha256}
              >
                {judge.source_sha256}
              </Typography.Hint>
            </div>
          </div>
        </div>

        {/* Read-only card: deliberately empty right action area (no edit, delete, or scheduling buttons) */}
        <div />
      </div>

      {/* Expanded view: source code and optional expectations schema */}
      {isExpanded && (
        <div
          id={detailsId}
          css={{
            gridColumn: '2 / -1',
            marginTop: theme.spacing.md,
            paddingLeft: theme.spacing.lg,
            minWidth: 0,
          }}
        >
          <div css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md, minWidth: 0 }}>
            <div css={{ minWidth: 0 }}>
              <Typography.Text bold>
                <FormattedMessage defaultMessage="Source code" description="Header for Git-managed judge source code" />
              </Typography.Text>
              <div data-testid="git-managed-source-code" css={{ marginTop: theme.spacing.xs, minWidth: 0 }}>
                <CodeBlockWithCopy code={judge.source} language="python" theme={theme} />
              </div>
            </div>

            {judge.expectations_schema !== undefined && judge.expectations_schema !== null && (
              <div css={{ minWidth: 0 }}>
                <Typography.Text bold>
                  <FormattedMessage
                    defaultMessage="Supported expectation schema"
                    description="Header for Git-managed judge supported expectation schema"
                  />
                </Typography.Text>
                <div data-testid="git-managed-expectations-schema" css={{ marginTop: theme.spacing.xs, minWidth: 0 }}>
                  <CodeBlockWithCopy
                    code={JSON.stringify(judge.expectations_schema, null, 2)}
                    language="json"
                    theme={theme}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

export default GitManagedScorerCard;
