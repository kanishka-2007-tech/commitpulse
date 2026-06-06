import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlsPanel } from './ControlsPanel';

const defaultProps = {
  username: 'octocat',
  theme: 'dark',
  bgHex: '',
  accentHex: '',
  textHex: '',
  scale: 'linear',
  speed: '8s',
  font: 'Inter',
  year: '',
  radius: 8,
  size: 'medium',
  onUsernameChange: vi.fn(),
  onThemeChange: vi.fn(),
  onBgHexChange: vi.fn(),
  onAccentHexChange: vi.fn(),
  onTextHexChange: vi.fn(),
  onScaleChange: vi.fn(),
  onSpeedChange: vi.fn(),
  onFontChange: vi.fn(),
  onYearChange: vi.fn(),
  onSizeChange: vi.fn(),
  onClearOverrides: vi.fn(),
  onRadiusChange: vi.fn(),
} satisfies ComponentProps<typeof ControlsPanel>;

const renderPanel = (props: Partial<ComponentProps<typeof ControlsPanel>> = {}) =>
  render(<ControlsPanel {...defaultProps} {...props} />);

describe('ControlsPanel - Interactive Tooltips, Cursor Hovers & Touch Event Propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('triggers mouseenter hover gestures on active segmented controls without changing selection', () => {
    renderPanel({ scale: 'linear' });
    const linearButton = screen.getByRole('button', { name: 'Linear' });
    const hoverSpy = vi.fn();

    linearButton.addEventListener('mouseenter', hoverSpy);
    fireEvent.mouseEnter(linearButton);

    expect(hoverSpy).toHaveBeenCalledTimes(1);
    expect(linearButton).toHaveClass('bg-emerald-500/15', 'border', 'text-emerald-700');
    expect(defaultProps.onScaleChange).not.toHaveBeenCalled();
  });

  it('exposes native tooltip labels at stable computed coordinates for color swatches', () => {
    renderPanel({ theme: 'neon' });
    const accentSwatch = screen.getByTitle(/^accent:/i);

    vi.spyOn(accentSwatch, 'getBoundingClientRect').mockReturnValue({
      x: 144,
      y: 88,
      width: 20,
      height: 20,
      top: 88,
      right: 164,
      bottom: 108,
      left: 144,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.mouseEnter(accentSwatch);
    const rect = accentSwatch.getBoundingClientRect();

    expect(accentSwatch).toHaveAttribute('title', expect.stringMatching(/^accent: #[0-9a-f]+$/i));
    expect(rect.left).toBe(144);
    expect(rect.top).toBe(88);
    expect(accentSwatch).toHaveClass('w-5', 'h-5', 'rounded-md');
  });

  it('propagates custom click and touch gestures from controls to the panel boundary', () => {
    const onScaleChange = vi.fn();
    const onBoundaryClick = vi.fn();
    const onBoundaryTouchStart = vi.fn();

    render(
      <div onClick={onBoundaryClick} onTouchStart={onBoundaryTouchStart}>
        <ControlsPanel {...defaultProps} onScaleChange={onScaleChange} />
      </div>
    );

    const logButton = screen.getByRole('button', { name: 'Logarithmic' });
    fireEvent.touchStart(logButton);
    fireEvent.click(logButton);

    expect(onBoundaryTouchStart).toHaveBeenCalledTimes(1);
    expect(onBoundaryClick).toHaveBeenCalledTimes(1);
    expect(onScaleChange).toHaveBeenCalledWith('log');
  });

  it('applies pointer cursor affordances to hoverable select and color-picker targets', () => {
    renderPanel({ bgHex: '101820', accentHex: '00ffaa', textHex: 'ffffff' });

    const themeSelect = document.getElementById('theme-select');
    const colorPickerInput = screen.getByLabelText('Color picker for Background');
    const colorPickerSurface = colorPickerInput.closest('label');

    expect(themeSelect).toHaveClass('cursor-pointer');
    expect(colorPickerInput).toHaveClass('cursor-pointer');
    expect(colorPickerSurface).toHaveClass('cursor-pointer', 'hover:border-emerald-500/50');
  });

  it('hides temporary disabled-theme overlay text after mouseleave and theme reset rerender', () => {
    const { rerender } = renderPanel({ theme: 'random' });
    const randomSwatch = screen.getByTitle(/^Random accent sample 1:/);

    expect(screen.getByText(/Random changes on every page load/i)).toBeInTheDocument();

    fireEvent.mouseLeave(randomSwatch);
    rerender(<ControlsPanel {...defaultProps} theme="dark" />);

    expect(screen.queryByText(/Random changes on every page load/i)).not.toBeInTheDocument();
    expect(screen.getByTitle(/^bg:/i)).toBeInTheDocument();
  });
});
