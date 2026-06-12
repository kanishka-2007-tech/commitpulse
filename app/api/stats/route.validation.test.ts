import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/github', () => ({
  fetchGitHubContributions: vi.fn(),
}));

import { fetchGitHubContributions } from '@/lib/github';
import type { ContributionCalendar } from '@/types';
import { quotaMonitor } from '@/services/github/quota-monitor';
import { refreshPolicy } from '@/services/github/refresh-policy';
import { refreshRateLimiter } from '@/services/github/refresh-rate-limiter';

const mockCalendar: ContributionCalendar = {
  totalContributions: 15,
  weeks: [
    {
      contributionDays: [
        { contributionCount: 5, date: '2024-06-10' },
        { contributionCount: 10, date: '2024-06-11' },
      ],
    },
  ],
};

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL('http://localhost/api/stats');

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return new Request(url.toString(), {
    headers: new Headers({
      'x-forwarded-for': '127.0.0.1',
    }),
  });
}

describe('GET /api/stats validation and cache coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    quotaMonitor.reset();
    refreshPolicy.reset();
    refreshRateLimiter.reset();

    vi.mocked(fetchGitHubContributions).mockResolvedValue({
      calendar: mockCalendar,
      repoContributions: [],
    });
  });

  it('treats bypassCache=true as a refresh request', async () => {
    const response = await GET(
      makeRequest({
        user: 'octocat',
        bypassCache: 'true',
      })
    );

    expect(response.status).toBe(200);

    expect(fetchGitHubContributions).toHaveBeenCalledWith('octocat', {
      bypassCache: true,
    });

    expect(response.headers.get('X-Refresh-Status')).toBe('Fresh');
  });

  it('returns cache HIT status for normal requests', async () => {
    const response = await GET(
      makeRequest({
        user: 'octocat',
      })
    );

    expect(response.status).toBe(200);

    expect(response.headers.get('X-Cache-Status')).toBe('HIT');
    expect(response.headers.get('X-Refresh-Status')).toBe('Cached');
  });

  it('returns 404 when github lookup cannot resolve user', async () => {
    vi.mocked(fetchGitHubContributions).mockRejectedValue(new Error('Could not resolve user'));

    const response = await GET(
      makeRequest({
        user: 'missing-user',
      })
    );

    expect(response.status).toBe(404);

    const body = await response.json();

    expect(body.error).toBe('User not found');
  });

  it('returns rate limit headers when refresh limit is exceeded', async () => {
    vi.spyOn(refreshRateLimiter, 'checkLimit').mockReturnValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset: 12345,
    });

    const response = await GET(
      makeRequest({
        user: 'octocat',
        refresh: 'true',
      })
    );

    expect(response.status).toBe(429);

    expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(response.headers.get('X-RateLimit-Reset')).toBe('12345');
  });

  it('returns github rate limit error when api limit is reached', async () => {
    vi.mocked(fetchGitHubContributions).mockRejectedValue(new Error('status 403'));

    const response = await GET(
      makeRequest({
        user: 'octocat',
      })
    );

    expect(response.status).toBe(429);

    const body = await response.json();

    expect(body.error).toContain('GitHub API rate limit reached');
  });
});
