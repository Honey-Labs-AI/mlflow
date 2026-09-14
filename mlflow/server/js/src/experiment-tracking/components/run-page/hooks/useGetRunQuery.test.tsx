import { RUNS_AUTO_REFRESH_INTERVAL } from '../../experiment-page/utils/experimentPage.fetch-utils';
import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import { graphql } from 'msw';
import { useGetRunQuery } from './useGetRunQuery';
import { setupServer } from '../../../../common/utils/setup-msw';
import { TestApolloProvider } from '../../../../common/utils/TestApolloProvider';
import type { GetRun } from '../../../../graphql/__generated__/graphql';
import { MlflowRunStatus } from '../../../../graphql/__generated__/graphql';

describe('useGetRunQuery', () => {
  const server = setupServer();

  beforeEach(() => {
    server.resetHandlers();
  });

  it('returns a correct data payload corresponding to mocked response', async () => {
    server.use(
      graphql.query('GetRun', (req, res, ctx) =>
        res(
          ctx.data({
            mlflowGetRun: {
              apiError: null,
              run: {
                info: {
                  runName: 'test-run-name',
                  artifactUri: 'test-artifact-uri',
                  startTime: '174000000',
                  endTime: '175000000',
                  experimentId: 'test-experiment-id',
                  lifecycleStage: 'active',
                  runUuid: 'test-run-uuid',
                  status: MlflowRunStatus.FINISHED,
                  userId: null,
                },
                experiment: {
                  artifactLocation: 'test-artifact-location',
                  experimentId: 'test-experiment-id',
                  name: 'test-experiment-name',
                  lastUpdateTime: '175000000',
                  lifecycleStage: 'active',
                  tags: [],
                },
                modelVersions: null,
                data: null,
                inputs: null,
              },
            },
          }),
        ),
      ),
    );

    const { result } = renderHook(() => useGetRunQuery({ runUuid: 'test-run-uuid' }), {
      wrapper: ({ children }) => <TestApolloProvider disableCache>{children}</TestApolloProvider>,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data?.info?.runName).toEqual('test-run-name');
    expect(result.current.data?.experiment?.name).toEqual('test-experiment-name');
  });

  it('refreshes numeric metrics through completion and pauses while hidden', async () => {
    jest.useFakeTimers();
    let requests = 0;
    server.use(
      graphql.query('GetRun', (req, res, ctx) => {
        requests += 1;
        return res(
          ctx.data({
            mlflowGetRun: {
              apiError: null,
              run: {
                info: { runUuid: 'live-run', status: requests < 3 ? 'RUNNING' : 'FINISHED' },
                data: { metrics: [{ key: 'cases_completed', value: requests, step: requests, timestamp: '1' }] },
              },
            },
          }),
        );
      }),
    );
    const { result, unmount } = renderHook(() => useGetRunQuery({ runUuid: 'live-run' }), {
      wrapper: ({ children }) => <TestApolloProvider disableCache>{children}</TestApolloProvider>,
    });
    try {
      await waitFor(() => expect(result.current.data?.data?.metrics?.[0]?.value).toBe(1));
      for (const count of [2, 3, 4]) {
        await act(async () => {
          jest.advanceTimersByTime(RUNS_AUTO_REFRESH_INTERVAL);
        });
        await waitFor(() => expect(result.current.data?.data?.metrics?.[0]?.value).toBe(count));
      }
      expect(result.current.data?.info?.status).toBe('FINISHED');
      jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await act(async () => {
        jest.advanceTimersByTime(RUNS_AUTO_REFRESH_INTERVAL * 2);
      });
      expect(requests).toBe(4);
    } finally {
      unmount();
      jest.restoreAllMocks();
      jest.useRealTimers();
    }
  });

  it('returns an error corresponding to mocked failing response', async () => {
    server.use(
      graphql.query<GetRun>('GetRun', (req, res, ctx) => res(ctx.errors([{ message: 'test-error-message' }]))),
    );

    const { result } = renderHook(() => useGetRunQuery({ runUuid: 'test-run-uuid' }), {
      wrapper: TestApolloProvider,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.apolloError?.message).toEqual('test-error-message');
  });
});
