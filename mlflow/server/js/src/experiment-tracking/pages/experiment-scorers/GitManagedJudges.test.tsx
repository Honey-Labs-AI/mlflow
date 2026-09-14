import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from '@databricks/i18n';
import { DesignSystemProvider } from '@databricks/design-system';
import { QueryClient, QueryClientProvider } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import { parseGitManagedJudgesTag, GIT_MANAGED_JUDGES_TAG } from './gitManagedJudgesUtils';
import { GitManagedScorerCard } from './GitManagedScorerCard';
import ExperimentScorersContentContainer from './ExperimentScorersContentContainer';
import { useGetScheduledScorers } from './hooks/useGetScheduledScorers';
import { useGetExperimentQuery } from '../../hooks/useExperimentQuery';
import type { GitManagedJudge, GitManagedJudgeManifestEntry } from './types';

// Mock dependencies
jest.mock('./hooks/useGetScheduledScorers');
jest.mock('../../hooks/useExperimentQuery');
jest.mock('./hooks/useDeleteScheduledScorer', () => ({
  useDeleteScheduledScorerMutation: () => ({ mutate: jest.fn(), isLoading: false }),
}));
jest.mock('@mlflow/mlflow/src/assistant', () => ({
  useRegisterAssistantContext: jest.fn(),
}));
jest.mock('../../../common/utils/FeatureUtils', () => ({
  shouldPaginateScorers: () => false,
}));
jest.mock('./ScorerModalRenderer', () => ({
  __esModule: true,
  default: () => <div data-testid="scorer-modal-renderer" />,
}));

const mockedUseGetScheduledScorers = jest.mocked(useGetScheduledScorers);
const mockedUseGetExperimentQuery = jest.mocked(useGetExperimentQuery);

const createTestWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en">
        <DesignSystemProvider>{children}</DesignSystemProvider>
      </IntlProvider>
    </QueryClientProvider>
  );
};

const sampleSourceCode =
  'def evaluate(inputs, outputs):\n    return {"score": 1.0 if inputs["target"] == outputs["prediction"] else 0.0}';

const sampleExpectationSchema = {
  type: 'object',
  properties: {
    min_accuracy: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['min_accuracy'],
};

const sampleManifestEntry: GitManagedJudgeManifestEntry = {
  name: 'deterministic_accuracy',
  description: 'Validates exact ground truth match against output predictions',
  kind: 'deterministic',
  source_path: 'judges/deterministic/accuracy.py',
  source_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  source_tag: 'mlflow.ui.judges.source.deterministic_accuracy',
  expectations_schema_tag: 'mlflow.ui.judges.expectationsSchema',
};

const sampleHydratedJudge: GitManagedJudge = {
  name: sampleManifestEntry.name,
  description: sampleManifestEntry.description,
  kind: sampleManifestEntry.kind,
  source: sampleSourceCode,
  source_path: sampleManifestEntry.source_path,
  source_sha256: sampleManifestEntry.source_sha256,
  source_tag: sampleManifestEntry.source_tag,
  expectations_schema_tag: sampleManifestEntry.expectations_schema_tag,
  expectations_schema: sampleExpectationSchema,
};

const sampleTagsArray = [
  { key: sampleManifestEntry.source_tag, value: sampleSourceCode },
  { key: sampleManifestEntry.expectations_schema_tag!, value: JSON.stringify(sampleExpectationSchema) },
];

const sampleTagsRecord = {
  [sampleManifestEntry.source_tag]: sampleSourceCode,
  [sampleManifestEntry.expectations_schema_tag!]: JSON.stringify(sampleExpectationSchema),
} satisfies Record<string, string>;

describe('Git-managed judges', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseGitManagedJudgesTag', () => {
    it('returns empty list and no error when tag is null, undefined, or whitespace', () => {
      expect(parseGitManagedJudgesTag(undefined, sampleTagsArray)).toEqual({ judges: [], error: null });
      expect(parseGitManagedJudgesTag(null, sampleTagsArray)).toEqual({ judges: [], error: null });
      expect(parseGitManagedJudgesTag('', sampleTagsArray)).toEqual({ judges: [], error: null });
      expect(parseGitManagedJudgesTag('   ', sampleTagsArray)).toEqual({ judges: [], error: null });
    });

    it('parses valid manifest and hydrates source and schema from tags array', () => {
      const manifest = {
        version: 1,
        judges: [sampleManifestEntry],
      };
      const result = parseGitManagedJudgesTag(JSON.stringify(manifest), sampleTagsArray);
      expect(result.error).toBeNull();
      expect(result.judges).toHaveLength(1);
      expect(result.judges[0].name).toBe('deterministic_accuracy');
      expect(result.judges[0].source).toBe(sampleSourceCode);
      expect(result.judges[0].expectations_schema).toEqual(sampleExpectationSchema);
    });

    it('parses valid manifest and hydrates source and schema from tags record', () => {
      const manifest = {
        version: 1,
        judges: [sampleManifestEntry],
      };
      const result = parseGitManagedJudgesTag(JSON.stringify(manifest), sampleTagsRecord);
      expect(result.error).toBeNull();
      expect(result.judges).toHaveLength(1);
      expect(result.judges[0].source).toBe(sampleSourceCode);
      expect(result.judges[0].expectations_schema).toEqual(sampleExpectationSchema);
    });

    it('parses valid manifest without expectations_schema_tag', () => {
      const { expectations_schema_tag, ...entryWithoutSchema } = sampleManifestEntry;
      const manifest = {
        version: 1,
        judges: [entryWithoutSchema],
      };
      const result = parseGitManagedJudgesTag(JSON.stringify(manifest), sampleTagsArray);
      expect(result.error).toBeNull();
      expect(result.judges).toHaveLength(1);
      expect(result.judges[0].expectations_schema).toBeUndefined();
    });

    it('returns error when referenced source_tag is missing from experiment tags', () => {
      const manifest = {
        version: 1,
        judges: [sampleManifestEntry],
      };
      // Tags missing source_tag
      const result = parseGitManagedJudgesTag(JSON.stringify(manifest), []);
      expect(result.error).toContain(
        'Referenced source tag "mlflow.ui.judges.source.deterministic_accuracy" not found',
      );
      expect(result.judges).toHaveLength(0);
    });

    it('returns error when referenced expectations_schema_tag is missing from experiment tags', () => {
      const manifest = {
        version: 1,
        judges: [sampleManifestEntry],
      };
      // Tags with only source tag
      const tagsWithOnlySource = [{ key: sampleManifestEntry.source_tag, value: sampleSourceCode }];
      const result = parseGitManagedJudgesTag(JSON.stringify(manifest), tagsWithOnlySource);
      expect(result.error).toContain(
        'Referenced expectations schema tag "mlflow.ui.judges.expectationsSchema" not found',
      );
      expect(result.judges).toHaveLength(0);
    });

    it('returns error when referenced expectations_schema_tag contains invalid JSON', () => {
      const manifest = {
        version: 1,
        judges: [sampleManifestEntry],
      };
      const tagsWithBadSchema = [
        { key: sampleManifestEntry.source_tag, value: sampleSourceCode },
        { key: sampleManifestEntry.expectations_schema_tag!, value: 'not-json-content' },
      ];
      const result = parseGitManagedJudgesTag(JSON.stringify(manifest), tagsWithBadSchema);
      expect(result.error).toContain('Failed to parse expectations schema tag');
      expect(result.judges).toHaveLength(0);
    });

    it('rejects duplicate judge names to avoid React key collisions', () => {
      const manifest = {
        version: 1,
        judges: [sampleManifestEntry, { ...sampleManifestEntry }],
      };
      const result = parseGitManagedJudgesTag(JSON.stringify(manifest), sampleTagsArray);
      expect(result.error).toContain('Duplicate judge name "deterministic_accuracy" found in catalog');
      expect(result.judges).toHaveLength(0);
    });

    it('enforces reference contract without inline fallback', () => {
      // Inline source without source_tag must be rejected
      const legacyInlineJudge = {
        name: 'legacy_inline',
        description: 'Legacy inline judge',
        kind: 'deterministic',
        source: sampleSourceCode,
        source_path: 'judges/accuracy.py',
        source_sha256: 'hash123',
      };
      const manifest = {
        version: 1,
        judges: [legacyInlineJudge],
      };
      const result = parseGitManagedJudgesTag(JSON.stringify(manifest), sampleTagsArray);
      expect(result.error).toContain('missing a valid source_tag reference');
    });

    it('returns error when JSON syntax is invalid', () => {
      const result = parseGitManagedJudgesTag('{ invalid json content', sampleTagsArray);
      expect(result.error).toBeTruthy();
      expect(result.judges).toHaveLength(0);
    });

    it('returns error when catalog is not an object or is an array', () => {
      const resultArr = parseGitManagedJudgesTag(JSON.stringify([sampleManifestEntry]), sampleTagsArray);
      expect(resultArr.error).toContain('Catalog must be a JSON object');

      const resultStr = parseGitManagedJudgesTag('"string-catalog"', sampleTagsArray);
      expect(resultStr.error).toContain('Catalog must be a JSON object');
    });

    it('returns error when catalog version is not 1', () => {
      const result = parseGitManagedJudgesTag(JSON.stringify({ version: 2, judges: [] }), sampleTagsArray);
      expect(result.error).toContain('Unsupported catalog version: 2');
    });

    it('returns error when judges property is not an array', () => {
      const result = parseGitManagedJudgesTag(JSON.stringify({ version: 1, judges: 'not-an-array' }), sampleTagsArray);
      expect(result.error).toContain('must be an array');
    });

    it('returns error when a judge entry is missing required fields', () => {
      const invalidJudge = {
        name: 'missing_path',
        description: 'Missing source path',
        kind: 'deterministic',
        source_sha256: 'hash',
        source_tag: 'tag',
      };
      const result = parseGitManagedJudgesTag(JSON.stringify({ version: 1, judges: [invalidJudge] }), sampleTagsArray);
      expect(result.error).toContain('missing a source_path');
    });
  });

  describe('GitManagedScorerCard', () => {
    it('renders read-only card with status tag, role/description, relative path, and hash', () => {
      const Wrapper = createTestWrapper();
      render(<GitManagedScorerCard judge={sampleHydratedJudge} />, { wrapper: Wrapper });

      // Judge name and badges
      expect(screen.getByText('deterministic_accuracy')).toBeInTheDocument();
      expect(screen.getByTestId('git-managed-status-tag')).toHaveTextContent('Git-managed');
      expect(screen.getByTestId('git-managed-kind-tag')).toHaveTextContent('deterministic');

      // Role / description
      expect(screen.getByTestId('git-managed-description')).toHaveTextContent(
        'Validates exact ground truth match against output predictions',
      );

      // Relative source path and source sha256 hash
      expect(screen.getByTestId('git-managed-source-path')).toHaveTextContent('judges/deterministic/accuracy.py');
      expect(screen.getByTestId('git-managed-source-hash')).toHaveTextContent(sampleHydratedJudge.source_sha256);

      // Read-only: strictly no edit, delete, scheduling, or trace evaluation controls
      expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /schedule/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/sample rate/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/evaluate sample traces/i)).not.toBeInTheDocument();
    });

    it('provides accessible button-only expansion with aria-expanded and aria-controls', () => {
      const Wrapper = createTestWrapper();
      render(<GitManagedScorerCard judge={sampleHydratedJudge} />, { wrapper: Wrapper });

      const expandButton = screen.getByTestId('git-judge-expand-button');
      const expectedDetailsId = `git-judge-details-${sampleHydratedJudge.name}`;

      // Accessibility checks
      expect(expandButton).toHaveAttribute('aria-expanded', 'false');
      expect(expandButton).toHaveAttribute('aria-controls', expectedDetailsId);
      expect(expandButton).toHaveAttribute('aria-label', expect.stringContaining('deterministic_accuracy'));

      // Initially collapsed: source code and schema are not visible
      expect(screen.queryByTestId('git-managed-source-code')).not.toBeInTheDocument();

      // Click button to expand
      fireEvent.click(expandButton);
      expect(expandButton).toHaveAttribute('aria-expanded', 'true');

      const detailsContainer = document.getElementById(expectedDetailsId);
      expect(detailsContainer).toBeInTheDocument();

      // Source code and expectations schema are visible
      expect(screen.getByTestId('git-managed-source-code')).toBeInTheDocument();
      expect(screen.getByTestId('git-managed-source-code')).toHaveTextContent('def evaluate(inputs, outputs):');
      expect(screen.getByTestId('git-managed-expectations-schema')).toBeInTheDocument();
      expect(screen.getByTestId('git-managed-expectations-schema')).toHaveTextContent('"min_accuracy"');

      // Click button again to collapse
      fireEvent.click(expandButton);
      expect(expandButton).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByTestId('git-managed-source-code')).not.toBeInTheDocument();
    });
  });

  describe('ExperimentScorersContentContainer with Git-managed judges', () => {
    const experimentId = 'exp-test-123';

    it('shows Git-managed judges when native registry is empty (empty registry with Git judges)', () => {
      mockedUseGetScheduledScorers.mockReturnValue({
        data: { scheduledScorers: [] },
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      const manifest = {
        version: 1,
        judges: [sampleManifestEntry],
      };

      mockedUseGetExperimentQuery.mockReturnValue({
        data: {
          tags: [
            { key: GIT_MANAGED_JUDGES_TAG, value: JSON.stringify(manifest) },
            { key: sampleManifestEntry.source_tag, value: sampleSourceCode },
            { key: sampleManifestEntry.expectations_schema_tag!, value: JSON.stringify(sampleExpectationSchema) },
          ],
        },
        loading: false,
      } as any);

      const Wrapper = createTestWrapper();
      render(<ExperimentScorersContentContainer experimentId={experimentId} />, { wrapper: Wrapper });

      // Empty state renderer should NOT be displayed
      expect(screen.queryByText(/Add a judge to your experiment/i)).not.toBeInTheDocument();

      // Git judge should be rendered
      expect(screen.getByText('deterministic_accuracy')).toBeInTheDocument();
      expect(screen.getByTestId('git-managed-status-tag')).toHaveTextContent('Git-managed');
      expect(screen.getByTestId('git-managed-source-path')).toHaveTextContent('judges/deterministic/accuracy.py');

      // Native creation button remains available in header
      expect(screen.getByText('New LLM judge')).toBeInTheDocument();
    });

    it('renders both native registered judges and Git-managed judges (coexistence)', () => {
      const nativeScorer = {
        name: 'native_correctness_judge',
        type: 'llm' as const,
        sampleRate: 100,
        filterString: '',
        llmTemplate: 'Correctness',
      };
      mockedUseGetScheduledScorers.mockReturnValue({
        data: { scheduledScorers: [nativeScorer] },
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      const manifest = {
        version: 1,
        judges: [sampleManifestEntry],
      };

      mockedUseGetExperimentQuery.mockReturnValue({
        data: {
          tags: [
            { key: GIT_MANAGED_JUDGES_TAG, value: JSON.stringify(manifest) },
            { key: sampleManifestEntry.source_tag, value: sampleSourceCode },
            { key: sampleManifestEntry.expectations_schema_tag!, value: JSON.stringify(sampleExpectationSchema) },
          ],
        },
        loading: false,
      } as any);

      const Wrapper = createTestWrapper();
      render(<ExperimentScorersContentContainer experimentId={experimentId} />, { wrapper: Wrapper });

      // Both native and Git judges are visible
      expect(screen.getByText('native_correctness_judge')).toBeInTheDocument();
      expect(screen.getByText('deterministic_accuracy')).toBeInTheDocument();

      // No invalid catalog alert
      expect(screen.queryByTestId('invalid-git-catalog-alert')).not.toBeInTheDocument();
    });

    it('displays clear invalid catalog message and preserves native judges when tag is malformed (malformed data)', () => {
      const nativeScorer = {
        name: 'preserved_native_judge',
        type: 'llm' as const,
        sampleRate: 50,
        filterString: '',
        llmTemplate: 'Safety',
      };
      mockedUseGetScheduledScorers.mockReturnValue({
        data: { scheduledScorers: [nativeScorer] },
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      // Malformed manifest tag
      mockedUseGetExperimentQuery.mockReturnValue({
        data: {
          tags: [{ key: GIT_MANAGED_JUDGES_TAG, value: '{ malformed json syntax' }],
        },
        loading: false,
      } as any);

      const Wrapper = createTestWrapper();
      render(<ExperimentScorersContentContainer experimentId={experimentId} />, { wrapper: Wrapper });

      // Clear invalid catalog message is shown
      expect(screen.getByTestId('invalid-git-catalog-alert')).toBeInTheDocument();
      expect(screen.getByText('Invalid Git-managed judges catalog')).toBeInTheDocument();
      expect(
        screen.getByText(/The experiment tag mlflow.ui.judges.gitManaged contains invalid or malformed data/),
      ).toBeInTheDocument();

      // Native judges are preserved and visible
      expect(screen.getByText('preserved_native_judge')).toBeInTheDocument();
    });

    it('displays invalid catalog message when referenced source tag is missing and preserves native judges', () => {
      const nativeScorer = {
        name: 'preserved_native_judge',
        type: 'llm' as const,
        sampleRate: 50,
        filterString: '',
        llmTemplate: 'Safety',
      };
      mockedUseGetScheduledScorers.mockReturnValue({
        data: { scheduledScorers: [nativeScorer] },
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      const manifest = {
        version: 1,
        judges: [sampleManifestEntry],
      };

      // Tags contain manifest but MISSING the referenced source_tag
      mockedUseGetExperimentQuery.mockReturnValue({
        data: {
          tags: [{ key: GIT_MANAGED_JUDGES_TAG, value: JSON.stringify(manifest) }],
        },
        loading: false,
      } as any);

      const Wrapper = createTestWrapper();
      render(<ExperimentScorersContentContainer experimentId={experimentId} />, { wrapper: Wrapper });

      // Clear invalid catalog message is shown mentioning missing referenced tag
      expect(screen.getByTestId('invalid-git-catalog-alert')).toBeInTheDocument();
      expect(screen.getByText(/Referenced source tag/)).toBeInTheDocument();

      // Native judges are preserved and visible
      expect(screen.getByText('preserved_native_judge')).toBeInTheDocument();
    });

    it('shows empty state when registry is empty and no Git judges exist', () => {
      mockedUseGetScheduledScorers.mockReturnValue({
        data: { scheduledScorers: [] },
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      mockedUseGetExperimentQuery.mockReturnValue({
        data: { tags: [] },
        loading: false,
      } as any);

      const Wrapper = createTestWrapper();
      render(<ExperimentScorersContentContainer experimentId={experimentId} />, { wrapper: Wrapper });

      // Native empty state should be displayed
      expect(screen.getByText(/Add a judge to your experiment/i)).toBeInTheDocument();
    });
  });
});
