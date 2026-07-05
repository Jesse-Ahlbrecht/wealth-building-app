import { IBKR_KEYWORDS } from './ibkrDepositPairHelpers';

export const getAccountBadgeConfig = (accountNameRaw) => {
  const accountName = (accountNameRaw || '').trim();
  if (!accountName) return null;

  const normalized = accountName.toLowerCase();
  const baseClass = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  if (normalized.includes('dkb')) {
    if (normalized.includes('giro')) {
      return { label: 'DKB Giro', className: 'account-badge account-badge-dkb account-badge-dkb-girokonto' };
    }
    if (normalized.includes('tagesgeld')) {
      return { label: 'DKB Tagesgeld', className: 'account-badge account-badge-dkb account-badge-dkb-tagesgeld' };
    }
    return { label: accountName, className: 'account-badge account-badge-dkb' };
  }

  if (normalized.includes('yuh')) {
    return { label: accountName, className: 'account-badge account-badge-yuh' };
  }

  if (normalized.includes('swisscard')) {
    return { label: accountName, className: 'account-badge account-badge-swisscard' };
  }

  if (normalized.includes('kfw')) {
    return { label: accountName, className: 'account-badge account-badge-kfw' };
  }

  if (IBKR_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return { label: 'Interactive Brokers', className: 'account-badge account-badge-interactive-brokers' };
  }

  return { label: accountName, className: `account-badge account-badge-default account-badge-${baseClass}` };
};
