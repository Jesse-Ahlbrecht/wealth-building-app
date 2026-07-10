import { COCKPIT_COLORS, cockpitColorWithOpacity } from './cockpitChartConfig';

export const STACKED_BAR_FILL_OPACITY = 0.82;
export const STACKED_BAR_DIM_OPACITY = 0.35;
export const STACKED_BAR_RADIUS = 6;
const SEGMENT_GAP = 1.5;
const STROKE_OPACITY = 0.85;

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
  hoveredIndex,
  hoveredSegment,
  selectedMonthKey,
  focusedSection,
  topRadius = 0
}) => (props) => {
  const { x, y, width, height, index, payload } = props;
  if (height == null || height <= 0) return null;

  const state = getBarSegmentVisualState({
    index,
    monthKey: payload.monthKey,
    segmentKey,
    hoveredIndex,
    hoveredSegment,
    selectedMonthKey,
    focusedSection
  });
  const fill = getBarSegmentFill(baseColor, state);

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

  return (
    <g style={{ transition: 'opacity 0.15s ease' }}>
      <path
        d={path}
        fill={fill}
        stroke={state.isFocusTarget ? baseColor : 'none'}
        strokeWidth={state.isFocusTarget ? 2 : 0}
      />
    </g>
  );
};

export const savedBarShape = ({
  hoveredIndex,
  hoveredSegment,
  selectedMonthKey,
  focusedSection,
  getBaseColor
}) => (props) => {
  const { x, y, width, height, index, payload } = props;
  if (height == null || height <= 0) return null;

  const baseColor = getBaseColor(payload);
  const state = getBarSegmentVisualState({
    index,
    monthKey: payload.monthKey,
    segmentKey: 'savings',
    hoveredIndex,
    hoveredSegment,
    selectedMonthKey,
    focusedSection
  });
  const fill = getBarSegmentFill(baseColor, state);
  const path = roundedBarPath(x, y, width, height, STACKED_BAR_RADIUS);

  return (
    <g style={{ transition: 'opacity 0.15s ease' }}>
      <path
        d={path}
        fill={fill}
        stroke={baseColor}
        strokeWidth={state.isFocusTarget ? 2.5 : 1}
        strokeOpacity={state.isFocusTarget ? 1 : STROKE_OPACITY}
      />
    </g>
  );
};

export const buildStackedBarShapes = (interaction, segmentConfigs) => (
  Object.fromEntries(
    Object.entries(segmentConfigs).map(([name, config]) => [
      name,
      stackedBarSegmentShape({ ...interaction, ...config })
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
