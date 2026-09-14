import { describe, beforeAll, beforeEach, test, expect, jest } from '@jest/globals';

import { act, renderHook, waitFor } from '@testing-library/react';
import { rest } from 'msw';
import { setupServer } from '../../../../common/utils/setup-msw';
import { useExperimentEvaluationRunsData } from './useExperimentEvaluationRunsData';
import { RUNS_AUTO_REFRESH_INTERVAL } from '../utils/experimentPage.fetch-utils';
import { QueryClient, QueryClientProvider } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';

describe('useExperimentEvaluationRunsData', () => {
  const server = setupServer();

  beforeAll(() => server.listen());

  beforeEach(() => {
    server.use(
      rest.post('/ajax-api/2.0/mlflow/runs/search', (req, res, ctx) =>
        res(
          ctx.json({
            runs: [
              {
                info: {
                  run_uuid: 'run-1',
                  name: 'test-logged-model-1',
                  experiment_id: 'test-experiment',
                },
                outputs: {
                  model_outputs: [
                    {
                      model_id: 'm-1',
                    },
                  ],
                },
              },
              {
                info: {
                  run_uuid: 'run-2',
                  name: 'test-logged-model-1',
                  experiment_id: 'test-experiment',
                },
              },
            ],
          }),
        ),
      ),
    );
  });

  test('discovers new runs and refreshes metrics even after loaded runs finish', async () => {
    jest.useFakeTimers();
    let requests = 0;
    server.use(
      rest.post('/ajax-api/2.0/mlflow/runs/search', (req, res, ctx) => {
        requests += 1;
        return res(
          ctx.json({
            runs: [
              {
                info: {
                  run_uuid: requests === 1 ? 'old-finished' : 'new-run',
                  status: requests === 2 ? 'RUNNING' : 'FINISHED',
                },
                data: { metrics: [{ key: 'completed', value: requests }] },
              },
            ],
          }),
        );
      }),
    );
    const client = new QueryClient();
    const { result, unmount } = renderHook(
      () => useExperimentEvaluationRunsData({ experimentId: 'test-experiment', enabled: true, filter: '' }),
      { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> },
    );
    try {
      await waitFor(() => expect(result.current.data).toHaveLength(1));
      for (const count of [2, 3, 4]) {
        await act(async () => {
          jest.advanceTimersByTime(RUNS_AUTO_REFRESH_INTERVAL);
        });
        await waitFor(() => expect(result.current.data[0].data.metrics[0].value).toBe(count));
        expect(result.current.data[0].info).toEqual(expect.objectContaining({ run_uuid: 'new-run' }));
      }
      expect(requests).toBe(4);
    } finally {
      unmount();
      client.clear();
      jest.useRealTimers();
    }
  });

  test('should separate runs with and without model outputs', async () => {
    const { result } = renderHook(
      () => useExperimentEvaluationRunsData({ experimentId: 'test-experiment', enabled: true, filter: '' }),
      {
        wrapper: ({ children }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>,
      },
    );
    await waitFor(() => {
      // expect only the run with no model output
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0]).toEqual(
        expect.objectContaining({
          info: expect.objectContaining({
            run_uuid: 'run-2',
            name: 'test-logged-model-1',
            experiment_id: 'test-experiment',
          }),
        }),
      );
    });

    expect(result.current.trainingRuns).toHaveLength(1);
    expect(result.current.trainingRuns?.[0]).toEqual(
      expect.objectContaining({
        info: expect.objectContaining({
          run_uuid: 'run-1',
          name: 'test-logged-model-1',
          experiment_id: 'test-experiment',
        }),
      }),
    );
  });
});
