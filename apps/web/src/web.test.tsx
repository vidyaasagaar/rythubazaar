import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { registerSchema, translate, LANGUAGE_CODES } from '@rythubazaar/shared';
import { I18nProvider, useI18n } from './context/I18nContext';
import { Handset } from './pages/phone/Handset';
import { zodFieldErrors } from './lib/forms';
import { ApiError } from './lib/api';
import { stockImageFor } from './components/listing';

afterEach(cleanup);

function renderHandset(overrides: Partial<Parameters<typeof Handset>[0]> = {}) {
  const props = {
    state: 'IDLE' as const,
    dialed: '',
    entry: '',
    prompt: null,
    elapsed: 0,
    summary: null,
    failure: null,
    lastError: null,
    demoCode: '12908',
    onKey: vi.fn(),
    onBackspace: vi.fn(),
    onClearAll: vi.fn(),
    onCall: vi.fn(),
    onHangup: vi.fn(),
    onRepeat: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider>
      <Handset {...props} />
    </I18nProvider>,
  );
  return props;
}

describe('keypad handset', () => {
  it('renders a full 12-key keypad with call and end keys', () => {
    const props = renderHandset({ dialed: '129' });
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']) {
      expect(screen.getByRole('button', { name: `Key ${k}` })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Key 0' }));
    expect(props.onKey).toHaveBeenCalledWith('0');
    fireEvent.click(screen.getByRole('button', { name: 'Call' }));
    expect(props.onCall).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'End call' }));
    expect(props.onHangup).toHaveBeenCalled();
    expect(screen.getByText('129')).toBeTruthy();
    expect(screen.getByText('DEMO')).toBeTruthy();
  });

  it('shows the prompt, options and DEMO CALL label when connected', () => {
    renderHandset({
      state: 'CONNECTED',
      elapsed: 65,
      prompt: {
        node: 'MAIN',
        language: 'en-IN',
        lines: [],
        body: ['Main menu.'],
        options: [
          { key: '1', label: 'Farmer services' },
          { key: '2', label: 'Order status' },
        ],
        inputMode: 'MENU',
        text: 'Main menu.',
      },
    });
    expect(screen.getByText('Main menu.')).toBeTruthy();
    expect(screen.getByText('Farmer services')).toBeTruthy();
    expect(screen.getByText('01:05')).toBeTruthy();
    expect(screen.getAllByText(translate('en-IN', 'phone.demoCall')).length).toBeGreaterThan(0);
  });

  it('shows a clear failure state', () => {
    renderHandset({ state: 'FAILED', failure: 'Number not available in demo' });
    expect(screen.getByText('Number not available in demo')).toBeTruthy();
    expect(screen.getAllByText(translate('en-IN', 'phone.state.FAILED')).length).toBeGreaterThan(0);
  });
});

describe('produce illustrations', () => {
  it('matches crop names in English and Indic scripts, falling back by category', () => {
    expect(stockImageFor('Tomato', 'VEGETABLES')).toBe('/produce/tomato.svg');
    expect(stockImageFor('Banana (Poovan)', 'FRUITS')).toBe('/produce/banana.svg');
    expect(stockImageFor('టమాటా', 'VEGETABLES')).toBe('/produce/tomato.svg');
    expect(stockImageFor('प्याज़ लाल', 'VEGETABLES')).toBe('/produce/onion.svg');
    expect(stockImageFor('Toor dal', 'GRAINS_PULSES')).toBe('/produce/dal.svg');
    expect(stockImageFor('Drumstick', 'VEGETABLES')).toBe('/produce/vegetables.svg');
    expect(stockImageFor('Guava', 'FRUITS')).toBe('/produce/fruits.svg');
  });
});

describe('translated form errors', () => {
  it('maps invalid fields to translated messages in every language', () => {
    const parsed = registerSchema.safeParse({
      name: 'A',
      email: 'nope',
      password: 'short',
      role: 'CUSTOMER',
    });
    expect(parsed.success).toBe(false);
    for (const lang of LANGUAGE_CODES) {
      const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) =>
        translate(lang, k, v);
      const errs = zodFieldErrors(t, parsed.error!);
      expect(errs.email).toBe(translate(lang, 'form.invalidEmail'));
      expect(errs.password).toBe(translate(lang, 'auth.passwordHint'));
      expect(errs.name).toBe(translate(lang, 'form.invalidField'));
    }
  });
});

describe('i18n provider', () => {
  function Probe({ err }: { err: unknown }) {
    const { t, errorText, setLang } = useI18n();
    return (
      <div>
        <p>{t('nav.market')}</p>
        <p>{errorText(err)}</p>
        <button onClick={() => setLang('ta-IN')}>ta</button>
      </div>
    );
  }

  it('switches the whole UI language and translates API error codes', () => {
    render(
      <I18nProvider>
        <Probe err={new ApiError(409, 'INSUFFICIENT_STOCK', 'x')} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText('ta'));
    expect(screen.getByText(translate('ta-IN', 'nav.market'))).toBeTruthy();
    expect(screen.getByText(translate('ta-IN', 'error.INSUFFICIENT_STOCK'))).toBeTruthy();
    expect(document.documentElement.lang).toBe('ta-IN');
  });
});
