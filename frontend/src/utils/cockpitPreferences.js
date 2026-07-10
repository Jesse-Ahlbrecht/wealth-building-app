import { COCKPIT_VIEW_KEYS } from './cockpitChartConfig';

const LEGACY_COCKPIT_CHART_VIEWS = {
  cumulative: 'saved',
  rate: 'saved'
};

export const migrateCockpitChartView = (view) => {
  if (LEGACY_COCKPIT_CHART_VIEWS[view]) return LEGACY_COCKPIT_CHART_VIEWS[view];
  if (COCKPIT_VIEW_KEYS.includes(view)) return view;
  return 'saved';
};

export const isLegacyCockpitChartView = (view) => Boolean(LEGACY_COCKPIT_CHART_VIEWS[view]);
