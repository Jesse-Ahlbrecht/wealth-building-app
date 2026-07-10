import { COCKPIT_COLORS, cockpitColorWithOpacity } from './cockpitChartConfig';

export const STACKED_BAR_FILL_OPACITY = 0.82;
export const STACKED_BAR_DIM_OPACITY = 0.35;
export const STACKED_BAR_RADIUS = 6;
const SEGMENT_GAP = 1.5;
const STROKE_OPACITY = 0.85;
const BAR_PATH_SELECTOR = '[data-cockpit-bar-index]';

export const createBarInteractionRef = (initial = {}) => ({
  current: {
    hoveredIndex: null,
    hoveredSegment: null,
    selectedMonthKey: null,
    focusedSection: null,
    ...initial
  }
});

const getBarSegmentVisualState = ({
  index,
  monthKey,
  segmentKey,
  hoveredIndex,
  hoveredSegment,
  selectedMonthKey,
  focusedSection
}) => {
  const isHovering = hoveredIndex != null && hoveredSegment != null;
  const isSelectedMonth = monthKey === selectedMonthKey;

  if (isHovering) {
    const isHighlighted = hoveredIndex === index && hoveredSegment === segmentKey;
    return { isDimmed: !isHighlighted, isFocusTarget: false };
  }

  if (focusedSection != null && selectedMonthKey != null) {
    if (isSelectedMonth) {
      const isHighlighted = focusedSection === segmentKey;
      return { isDimmed: !isHighlighted, isFocusTarget: isHighlighted };
    }
    return { isDimmed: true, isFocusTarget: false };
  }

  return { isDimmed: false, isFocusTarget: false };
};

const getBarSegmentFill = (baseColor, { isDimmed }) => (
  cockpitColorWithOpacity(baseColor, isDimmed ? STACKED_BAR_DIM_OPACITY : STACKED_BAR_FILL_OPACITY)
);

export const syncBarSegmentStyles = (container, interactionRef) => {
  if (!container || !interactionRef?.current) return;

  const {
    hoveredIndex,
    hoveredSegment,
    selectedMonthKey,
    focusedSection
  } = interactionRef.current;

  container.querySelectorAll(BAR_PATH_SELECTOR).forEach((path) => {
    const index = Number(path.dataset.cockpitBarIndex);
    const segmentKey = path.dataset.cockpitBarSegment;
    const monthKey = path.dataset.cockpitBarMonth;
    const baseColor = path.dataset.cockpitBarColor;
    if (!baseColor) return;

    const state = getBarSegmentVisualState({
      index,
      monthKey,
      segmentKey,
      hoveredIndex,
      hoveredSegment,
      selectedMonthKey,
      focusedSection
    });
    const fill = getBarSegmentFill(baseColor, state);

    path.setAttribute('fill', fill);
    if (state.isFocusTarget) {
      path.setAttribute('stroke', baseColor);
      path.setAttribute('stroke-width', segmentKey === 'savings' && !path.dataset.cockpitBarStacked ? '2.5' : '2');
    } else if (path.dataset.cockpitBarStacked) {
      path.setAttribute('stroke', 'none');
      path.setAttribute('stroke-width', '0');
    } else {
      path.setAttribute('stroke', baseColor);
      path.setAttribute('stroke-width', '1');
      path.setAttribute('stroke-opacity', String(STROKE_OPACITY));
    }
  });
};

const roundedBarPath = (x, y, width, height, topRadius) => {
  const r = Math.min(topRadius, width / 2, height);
  if (r <= 0) {
    return `M${x},${y + height}V${y}H${x + width}V${y + height}Z`;
  }
  return `M${x},${y + height}L${x},${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
};

export const stackedBarSegmentShape = ({
  baseColor,
  segmentKey,
  layer,
  topRadius = 0
}) => (props) => {
  const { x, y, width, height, index, payload } = props;
  if (height == null || height <= 0) return null;

  let segY = y;
  let segH = height;
  if (layer === 'bottom') {
    segH = Math.max(0, height - SEGMENT_GAP / 2);
  } else if (layer === 'middle') {
    segY = y + SEGMENT_GAP / 2;
    segH = Math.max(0, height - SEGMENT_GAP);
  } else {
    segY = y + SEGMENT_GAP / 2;
    segH = Math.max(0, height - SEGMENT_GAP / 2);
  }
  if (segH <= 0) return null;

  const path = roundedBarPath(x, segY, width, segH, layer === 'top' ? topRadius : 0);
  const fill = cockpitColorWithOpacity(baseColor, STACKED_BAR_FILL_OPACITY);

  return (
    <path
      d={path}
      fill={fill}
      data-cockpit-bar-index={index}
      data-cockpit-bar-segment={segmentKey}
      data-cockpit-bar-month={payload.monthKey}
      data-cockpit-bar-color={baseColor}
      data-cockpit-bar-stacked="true"
      style={{ transition: 'fill 0.15s ease, stroke 0.15s ease' }}
    />
  );
};

export const savedBarShape = ({ getBaseColor }) => (props) => {
  const { x, y, width, height, index, payload } = props;
  if (height == null || height <= 0) return null;

  const baseColor = getBaseColor(payload);
  const path = roundedBarPath(x, y, width, height, STACKED_BAR_RADIUS);
  const fill = cockpitColorWithOpacity(baseColor, STACKED_BAR_FILL_OPACITY);

  return (
    <path
      d={path}
      fill={fill}
      stroke={baseColor}
      strokeWidth={1}
      strokeOpacity={STROKE_OPACITY}
      data-cockpit-bar-index={index}
      data-cockpit-bar-segment="savings"
      data-cockpit-bar-month={payload.monthKey}
      data-cockpit-bar-color={baseColor}
      style={{ transition: 'fill 0.15s ease, stroke 0.15s ease' }}
    />
  );
};

export const buildStackedBarShapes = (segmentConfigs) => (
  Object.fromEntries(
    Object.entries(segmentConfigs).map(([name, config]) => [
      name,
      stackedBarSegmentShape(config)
    ])
  )
);

export const INCOME_BAR_SEGMENT_CONFIGS = {
  essential: {
    baseColor: COCKPIT_COLORS.essential,
    segmentKey: 'essential',
    layer: 'bottom'
  },
  nonEssential: {
    baseColor: COCKPIT_COLORS.nonEssential,
    segmentKey: 'nonEssential',
    layer: 'middle'
  },
  savings: {
    baseColor: COCKPIT_COLORS.cumulative,
    segmentKey: 'savings',
    layer: 'top',
    topRadius: STACKED_BAR_RADIUS
  }
};

export const SPENDING_BAR_SEGMENT_CONFIGS = {
  essential: {
    baseColor: COCKPIT_COLORS.essential,
    segmentKey: 'essential',
    layer: 'bottom'
  },
  nonEssential: {
    baseColor: COCKPIT_COLORS.nonEssential,
    segmentKey: 'nonEssential',
    layer: 'top',
    topRadius: STACKED_BAR_RADIUS
  }
};
