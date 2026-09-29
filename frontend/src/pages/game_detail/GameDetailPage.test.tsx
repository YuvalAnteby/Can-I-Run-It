import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClientGameDto } from '../../@types/game.types';
import GameDetailPage from './GameDetailPage';

const { useGameDetailMock, useGameDetailFormMock } = vi.hoisted(() => ({
  useGameDetailMock: vi.fn(),
  useGameDetailFormMock: vi.fn(),
}));

vi.mock('./useGameDetail', () => ({
  useGameDetail: useGameDetailMock,
}));

vi.mock('./useGameDetailForm', () => ({
  useGameDetailForm: useGameDetailFormMock,
}));

const pendingGame = {
  id: 42,
  slug: 'issue-66-pending',
  name: 'Issue 66 Pending Game',
  status: 'pending_approval' as const,
  coverImageUrl: null,
  releaseDate: null,
  developer: null,
  publisher: null,
  genre: null,
  description: null,
  tags: [],
  supportsRayTracing: false,
  supportsDlss: false,
  supportsFsr: false,
  supportsXeSS: false,
  isTrending: false,
  trendingRank: null,
  requirements: [],
  attributions: [
    {
      source: 'rawg' as const,
      label: 'RAWG' as const,
      url: 'https://rawg.io/games/issue-66-pending',
    },
  ],
} as unknown as ClientGameDto;

const publishedGame = {
  ...pendingGame,
  slug: 'issue-66-published',
  status: 'published' as const,
} as unknown as ClientGameDto;

function LocationProbe(): ReactNode {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function makeFormState(): Record<string, unknown> {
  return {
    gpuResults: [],
    isLoadingGpus: false,
    setGpuQuery: vi.fn(),
    cpuResults: [],
    isLoadingCpus: false,
    setCpuQuery: vi.fn(),
    activeTier: null,
    setActiveTier: vi.fn(),
    currentReq: undefined,
    selectedGpu: '',
    selectedCpu: '',
    selectedGpuObj: null,
    selectedCpuObj: null,
    selectedRam: 16,
    setSelectedRam: vi.fn(),
    selectedStorage: 'ssd',
    setSelectedStorage: vi.fn(),
    selectedResolutionKey: '1920x1080',
    setSelectedResolutionKey: vi.fn(),
    customWidth: 1920,
    setCustomWidth: vi.fn(),
    customHeight: 1080,
    setCustomHeight: vi.fn(),
    selectedPreset: 'high',
    setSelectedPreset: vi.fn(),
    selectedTargetFps: 60,
    setSelectedTargetFps: vi.fn(),
    hasAttemptedSubmit: false,
    isChecking: false,
    checkResult: undefined,
    checkError: undefined,
    isFormValid: false,
    handleCheck: vi.fn(),
    handleGpuSelect: vi.fn(),
    handleCpuSelect: vi.fn(),
  };
}

function renderRoute(path: string): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GameDetailPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('GameDetailPage pending flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGameDetailMock.mockReturnValue({
      data: pendingGame,
      isLoading: false,
      isError: false,
    });
    useGameDetailFormMock.mockReturnValue(makeFormState());
  });

  it('renders pending defaults, an explicit requirements-unavailable state, and sanitized attributions', () => {
    renderRoute('/pending-games/42');

    expect(
      screen.getByRole('heading', { name: pendingGame.name }),
    ).toBeInTheDocument();
    expect(screen.getByText(/pending review/i)).toBeInTheDocument();
    expect(
      screen.getByText(/requirements not available yet/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'RAWG' })).toHaveAttribute(
      'href',
      'https://rawg.io/games/issue-66-pending',
    );
    expect(screen.queryByText(/undefined|null/i)).not.toBeInTheDocument();
  });

  it('replace-navigates an approved pending response to the published slug', async () => {
    useGameDetailMock
      .mockReturnValueOnce({
        data: publishedGame,
        isLoading: false,
        isError: false,
      })
      .mockReturnValue({
        data: publishedGame,
        isLoading: false,
        isError: false,
      });

    renderRoute('/pending-games/42');

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/games/issue-66-published',
      ),
    );
  });
});
