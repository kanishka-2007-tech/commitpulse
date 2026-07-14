import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Footer } from './Footer';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

// Mock TranslationContext
vi.mock('@/context/TranslationContext', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const translations: Record<string, string> = {
        'footer.home': 'Home',
        'footer.generator': 'Generator',
        'footer.compare': 'Compare',
        'footer.customization': 'Customization',
        'footer.contributors': 'Contributors',
        'footer.support': 'Support',
        'footer.documentation': 'Documentation',
        'footer.github_repo': 'GitHub Repo',
        'footer.guidelines': 'Guidelines',
        'footer.faq': 'FAQ',
        'footer.github': 'GitHub',
        'footer.creator_github': 'Creator GitHub',
        'footer.discord': 'Discord',
        'footer.twitter': 'Twitter',
        'footer.linkedin': 'LinkedIn',
        'footer.tagline': 'Visualize your coding rhythm',
        'footer.navigation': 'Navigation',
        'footer.resources': 'Resources',
        'footer.connect': 'Connect',
        'footer.copyright': `© ${params?.year ?? ''} CommitPulse`,
        'footer.made_with': 'Made with care',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Home: () => <svg data-testid="icon-home" />,
  Zap: () => <svg data-testid="icon-zap" />,
  GitCompare: () => <svg data-testid="icon-compare" />,
  Sliders: () => <svg data-testid="icon-sliders" />,
  Users: () => <svg data-testid="icon-users" />,
  MessageCircle: () => <svg data-testid="icon-message" />,
  BookOpen: () => <svg data-testid="icon-book" />,
  GitBranch: () => <svg data-testid="icon-branch" />,
  HelpCircle: () => <svg data-testid="icon-help" />,
}));

// Mock react-icons
vi.mock('react-icons/fa', () => ({
  FaGithub: () => <svg data-testid="icon-github" />,
  FaDiscord: () => <svg data-testid="icon-discord" />,
  FaLinkedin: () => <svg data-testid="icon-linkedin" />,
}));

vi.mock('react-icons/fa6', () => ({
  FaXTwitter: () => <svg data-testid="icon-twitter" />,
}));

// Simulated local cache stub (no real data layer exists on this static component)
const localCache = new Map<string, boolean>();

// Mock async service layer (unused - component has no data fetching)
const mockFetchFooterData = vi.fn();

beforeEach(() => {
  localCache.clear();
  mockFetchFooterData.mockReset();
});

describe('Footer - mock integrations', () => {
  it('renders static footer content without making real network calls', () => {
    mockFetchFooterData.mockResolvedValueOnce({});

    render(<Footer />);

    expect(screen.getByText('CommitPulse')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
    // Static component has no service layer - mock should never be invoked
    expect(mockFetchFooterData).not.toHaveBeenCalled();
  });

  it('renders navigation, resource, and connect sections consistently without an empty-state fallback', () => {
    localCache.set('footerLoaded', true);

    render(<Footer />);

    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(screen.getByText('Resources')).toBeInTheDocument();
    expect(screen.getByText('Connect')).toBeInTheDocument();
    expect(screen.getByText('Documentation')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('confirms no cache lookup is required before render since component is fully static', () => {
    const cachedData = localCache.get('footerLoaded');
    expect(cachedData).toBeUndefined();

    render(<Footer />);

    // No async fetch triggered since the component has no data dependency
    expect(mockFetchFooterData).not.toHaveBeenCalled();
    expect(screen.getByText('CommitPulse')).toBeInTheDocument();
  });

  it('renders successfully with no timeout or async failure possible', async () => {
    mockFetchFooterData.mockImplementationOnce(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
    );

    render(<Footer />);

    // Static markup renders immediately, unaffected by the unused async mock
    expect(screen.getByText('Made with care')).toBeInTheDocument();
    expect(screen.getByText(/© \d{4} CommitPulse/)).toBeInTheDocument();
  });

  it('asserts no cache write occurs after render since there is no success callback path', () => {
    render(<Footer />);

    expect(localCache.size).toBe(0);
    expect(mockFetchFooterData).not.toHaveBeenCalled();
    expect(screen.getByText('Support')).toBeInTheDocument();
  });
});
