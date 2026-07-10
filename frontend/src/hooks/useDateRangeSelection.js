import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  CHART_MARGIN_LEFT,
  CHART_MARGIN_RIGHT,
  CHART_MARGIN_TOP,
  CHART_MARGIN_BOTTOM
} from '../utils/chartConstants';

export function useDateRangeSelection(data, { onMonthClick, rerenderDeps = [] } = {}) {
  const chartContainerRef = useRef(null);
  const customButtonRef = useRef(null);
  const isDraggingRef = useRef(false);
  const plotMetricsRef = useRef(null);
  const selectionStartRef = useRef(null);
  const selectionEndRef = useRef(null);
  const hasMovedRef = useRef(false);

  const [timeRange, setTimeRange] = useState('1y');
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedRange, setSelectedRange] = useState(null);
  const [hasMoved, setHasMoved] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [showCustomHelp, setShowCustomHelp] = useState(false);

  const filteredData = useMemo(() => {
    if (selectedRange !== null) {
      const { startIndex, endIndex } = selectedRange;
      const start = Math.min(startIndex, endIndex);
      const end = Math.max(startIndex, endIndex) + 1;
      return data.slice(start, end);
    }

    if (timeRange === 'all') return data;

    const months = timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12;
    return data.slice(-months);
  }, [data, selectedRange, timeRange]);

  const refreshPlotMetrics = useCallback(() => {
    if (!chartContainerRef.current || filteredData.length === 0) {
      plotMetricsRef.current = null;
      return;
    }

    const chartWrapper = chartContainerRef.current.querySelector('.recharts-wrapper');
    if (!chartWrapper) {
      plotMetricsRef.current = null;
      return;
    }

    const wrapperRect = chartWrapper.getBoundingClientRect();
    const xAxis = chartWrapper.querySelector('.recharts-cartesian-axis-x');
    const yAxis = chartWrapper.querySelector('.recharts-cartesian-axis-y');

    if (xAxis && yAxis) {
      const yAxisRect = yAxis.getBoundingClientRect();
      const xAxisRect = xAxis.getBoundingClientRect();
      const plotAreaLeft = yAxisRect.right;
      const plotAreaRight = xAxisRect.right;
      const plotAreaTop = yAxisRect.top;
      const plotAreaBottom = xAxisRect.top;
      const plotAreaWidth = plotAreaRight - plotAreaLeft;

      plotMetricsRef.current = {
        plotAreaLeft,
        plotAreaRight,
        plotAreaTop,
        plotAreaBottom,
        barWidth: plotAreaWidth / filteredData.length,
        useWrapperBounds: false,
        wrapperRect
      };
      return;
    }

    const plotAreaLeft = wrapperRect.left + CHART_MARGIN_LEFT;
    const plotAreaRight = wrapperRect.right - CHART_MARGIN_RIGHT;
    const plotAreaTop = wrapperRect.top + CHART_MARGIN_TOP;
    const plotAreaBottom = wrapperRect.bottom - CHART_MARGIN_BOTTOM;

    plotMetricsRef.current = {
      plotAreaLeft,
      plotAreaRight,
      plotAreaTop,
      plotAreaBottom,
      barWidth: (plotAreaRight - plotAreaLeft) / filteredData.length,
      useWrapperBounds: true,
      wrapperRect
    };
  }, [filteredData]);

  useLayoutEffect(() => {
    refreshPlotMetrics();
    window.addEventListener('resize', refreshPlotMetrics);
    return () => window.removeEventListener('resize', refreshPlotMetrics);
  }, [refreshPlotMetrics, filteredData.length, ...rerenderDeps]);

  const getDataIndexFromX = useCallback((clientX, clientY) => {
    const metrics = plotMetricsRef.current;
    if (!metrics || filteredData.length === 0) return null;

    const {
      plotAreaLeft,
      plotAreaRight,
      plotAreaTop,
      plotAreaBottom,
      barWidth,
      useWrapperBounds,
      wrapperRect
    } = metrics;

    if (useWrapperBounds) {
      if (clientX < wrapperRect.left || clientX > wrapperRect.right) return null;
      if (clientY < wrapperRect.top || clientY > wrapperRect.bottom) return null;
    } else {
      if (clientX < plotAreaLeft || clientX > plotAreaRight) return null;
      if (clientY < plotAreaTop || clientY > plotAreaBottom) return null;
    }

    const relativeX = clientX - plotAreaLeft;
    const index = Math.floor(relativeX / barWidth);

    return Math.max(0, Math.min(filteredData.length - 1, index));
  }, [filteredData.length]);

  const handleMouseDown = useCallback((e) => {
    const chartElement = e.target.closest('.recharts-wrapper');
    if (!chartElement) return;

    if (e.target.tagName === 'text' && (
      e.target.closest('.recharts-xAxis') ||
      e.target.closest('.recharts-yAxis') ||
      e.target.closest('.recharts-cartesian-axis-tick')
    )) return;

    const isAxisClick = e.target.closest('.recharts-cartesian-axis') ||
      e.target.closest('.recharts-xAxis') ||
      e.target.closest('.recharts-yAxis') ||
      e.target.closest('.recharts-cartesian-axis-tick') ||
      e.target.closest('.recharts-label');
    if (isAxisClick) return;

    const index = getDataIndexFromX(e.clientX, e.clientY);
    if (index === null) return;

    isDraggingRef.current = true;
    setIsSelecting(true);
    selectionStartRef.current = index;
    selectionEndRef.current = index;
    hasMovedRef.current = false;
    setHasMoved(false);
    e.preventDefault();
  }, [getDataIndexFromX]);

  const handleMouseMove = useCallback((e) => {
    if (!isDraggingRef.current) return;

    const index = getDataIndexFromX(e.clientX, e.clientY);
    if (index === null) return;

    selectionEndRef.current = index;
    if (index !== selectionStartRef.current && !hasMovedRef.current) {
      hasMovedRef.current = true;
      setHasMoved(true);
    }
  }, [getDataIndexFromX]);

  const handleMouseUp = useCallback(() => {
    if (!isDraggingRef.current) return;

    const selectionStart = selectionStartRef.current;
    const selectionEnd = selectionEndRef.current;
    const moved = hasMovedRef.current;
    isDraggingRef.current = false;
    setIsSelecting(false);

    if (moved && selectionStart !== null && selectionEnd !== null) {
      const start = Math.min(selectionStart, selectionEnd);
      const end = Math.max(selectionStart, selectionEnd);

      if (start !== end) {
        setSelectedRange({ startIndex: start, endIndex: end });
        setTimeRange('custom');
      } else if (onMonthClick) {
        onMonthClick(filteredData[start]);
      }
    } else if (selectionStart !== null && onMonthClick) {
      onMonthClick(filteredData[selectionStart]);
    }

    selectionStartRef.current = null;
    selectionEndRef.current = null;
    hasMovedRef.current = false;
    setHasMoved(false);
  }, [filteredData, onMonthClick]);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleTimeRangeChange = useCallback((range) => {
    setTimeRange(range);
    setSelectedRange(null);
    if (range !== 'custom') {
      setShowCustomHelp(false);
    }
  }, []);

  const handleCustomClick = useCallback(() => {
    if (selectedRange === null) {
      setShowCustomHelp(true);
      handleTimeRangeChange('custom');
      setTimeout(() => setShowCustomHelp(false), 5000);
    } else {
      handleTimeRangeChange('custom');
    }
  }, [selectedRange, handleTimeRangeChange]);

  return {
    filteredData,
    timeRange,
    selectedRange,
    isSelecting,
    hasMoved,
    hoveredIndex,
    showCustomHelp,
    chartContainerRef,
    customButtonRef,
    handleTimeRangeChange,
    handleCustomClick,
    handleMouseDown,
    setHoveredIndex
  };
}
