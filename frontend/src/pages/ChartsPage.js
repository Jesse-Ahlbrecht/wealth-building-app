import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell
} from 'recharts';
import {
  SAVINGS_GOAL_CHF,
  SAVINGS_RATE_GOAL,
  getColorForPercentage
} from '../utils/finance';

const ChartsPage = ({
  chartData,
  timeRange,
  onChangeTimeRange,
  chartView,
  onChangeChartView,
  includeLoanPayments,
  onToggleIncludeLoanPayments,
  summary,
  formatMonth,
  formatCurrency,
  formatDate,
  expandedCategories,
  toggleCategory,
  categorySorts,
  toggleSort,
  getSortedTransactions,
  handleCategoryEdit,
  pendingCategoryChange,
  showEssentialSplit,
  essentialCategories,
  categoryEditModal,
  handlePredictionClick,
  handleDismissPrediction,
  setShowEssentialCategoriesModal,
  defaultCurrency,
  getTransactionKey,
  selectedMonth,
  onSelectMonth,
  MonthDetailComponent
}) => {
  const chartContainerRef = useRef(null);
  const isDraggingRef = useRef(false); // Track if we're currently dragging
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionEnd, setSelectionEnd] = useState(null);
  const [selectedRange, setSelectedRange] = useState(null); // { startIndex, endIndex }
  const [hasMoved, setHasMoved] = useState(false); // Track if mouse moved during drag
  const [hoveredIndex, setHoveredIndex] = useState(null); // Track hovered bar index

  // Helper function to lighten a color
  const lightenColor = (color, amount) => {
    // Handle rgb() format
    const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const r = Math.min(255, Math.round(parseInt(rgbMatch[1]) + (255 - parseInt(rgbMatch[1])) * amount));
      const g = Math.min(255, Math.round(parseInt(rgbMatch[2]) + (255 - parseInt(rgbMatch[2])) * amount));
      const b = Math.min(255, Math.round(parseInt(rgbMatch[3]) + (255 - parseInt(rgbMatch[3])) * amount));
      return `rgb(${r}, ${g}, ${b})`;
    }
    // Handle hex format
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = Math.min(255, Math.round(parseInt(hex.slice(0, 2), 16) + (255 - parseInt(hex.slice(0, 2), 16)) * amount));
      const g = Math.min(255, Math.round(parseInt(hex.slice(2, 4), 16) + (255 - parseInt(hex.slice(2, 4), 16)) * amount));
      const b = Math.min(255, Math.round(parseInt(hex.slice(4, 6), 16) + (255 - parseInt(hex.slice(4, 6), 16)) * amount));
      return `rgb(${r}, ${g}, ${b})`;
    }
    return color; // Return original if format not recognized
  };

  // Filter data based on time range or selected range
  const getFilteredData = () => {
    // If there's a selected range, use that
    if (selectedRange !== null) {
      const { startIndex, endIndex } = selectedRange;
      const start = Math.min(startIndex, endIndex);
      const end = Math.max(startIndex, endIndex) + 1;
      return chartData.slice(start, end);
    }

    // Otherwise use time range filter
    if (timeRange === 'all') return chartData;
    if (timeRange === 'custom') return chartData; // Custom without selection shows all

    const months = timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12;
    return chartData.slice(-months);
  };

  const filteredData = getFilteredData();

  // Calculate which data point corresponds to an x coordinate
  const getDataIndexFromX = useCallback((clientX, clientY) => {
    if (!chartContainerRef.current || filteredData.length === 0) return null;
    
    // Find the recharts-wrapper element to get accurate chart dimensions
    const chartWrapper = chartContainerRef.current.querySelector('.recharts-wrapper');
    if (!chartWrapper) return null;
    
    const wrapperRect = chartWrapper.getBoundingClientRect();
    
    // Find axis elements to determine plotting area boundaries
    const xAxis = chartWrapper.querySelector('.recharts-cartesian-axis-x');
    const yAxis = chartWrapper.querySelector('.recharts-cartesian-axis-y');
    
    let plotAreaLeft, plotAreaRight, plotAreaTop, plotAreaBottom, plotAreaWidth;
    
    if (xAxis && yAxis) {
      // Use axis positions if available
      const yAxisRect = yAxis.getBoundingClientRect();
      const xAxisRect = xAxis.getBoundingClientRect();
      
      // RECHARTS LAYOUT:
      // The yAxis group usually contains the ticks/labels to the left of the axis line.
      // But often recharts draws the axis line itself at the right edge of this group.
      // We'll assume the plotting area starts at the right edge of the Y-axis rect.
      // The xAxis usually contains ticks/labels below the axis line.
      // We'll assume the plotting area ends at the top edge of the X-axis rect.
      // Additionally, we should add a small buffer if needed or check bounding boxes of ticks.

      plotAreaLeft = yAxisRect.right;
      plotAreaRight = xAxisRect.right; // The X axis spans the full width usually
      
      // In recharts, the x-axis (bottom) usually has its 'top' at the bottom of the chart area
      // BUT sometimes the X axis rect only includes the text labels, or starts slightly lower.
      // A safer bet for 'bottom' of plot area is the top of the X-axis bounding box.
      plotAreaBottom = xAxisRect.top;

      // For the top of the plot area, Y-axis usually goes all the way up. 
      // Let's use the top of the Y-axis bounding box.
      plotAreaTop = yAxisRect.top;
      
      // Correction: The xAxisRect.left usually aligns with yAxisRect.right roughly.
      // But if we drag past the right edge of the chart, we shouldn't select.
      // Let's verify plotAreaRight. Actually, the xAxis element spans the width of the chart area usually.
      // Let's use the xAxis width to determine the right boundary more accurately if possible.
      // Alternatively, finding the 'recharts-surface' or chart background rect might be better?
      // Let's stick to: Left = Y-Axis Right, Right = X-Axis Right, Top = Y-Axis Top, Bottom = X-Axis Top.

      plotAreaWidth = plotAreaRight - plotAreaLeft;
      
      // Strict check: if click is on the ticks (left of plotAreaLeft) or labels (below plotAreaBottom)
      // The bounds check below handles it:
      if (clientX < plotAreaLeft || clientX > plotAreaRight) return null;
      if (clientY < plotAreaTop || clientY > plotAreaBottom) return null;
    } else {
      // Fallback to margin-based calculation if axes aren't found
      const marginLeft = 20;
      const marginRight = 30;
      const marginTop = 20;
      const marginBottom = 20;
      plotAreaLeft = wrapperRect.left + marginLeft;
      plotAreaRight = wrapperRect.right - marginRight;
      plotAreaTop = wrapperRect.top + marginTop;
      plotAreaBottom = wrapperRect.bottom - marginBottom;
      plotAreaWidth = plotAreaRight - plotAreaLeft;
      
      // Check if click is within reasonable bounds
      if (clientX < wrapperRect.left || clientX > wrapperRect.right) return null;
      if (clientY < wrapperRect.top || clientY > wrapperRect.bottom) return null;
    }
    
    const barWidth = plotAreaWidth / filteredData.length;
    const relativeX = clientX - plotAreaLeft;
    const index = Math.floor(relativeX / barWidth);
    
    return Math.max(0, Math.min(filteredData.length - 1, index));
  }, [filteredData]);

  // Handle mouse down - start selection
  const handleMouseDown = useCallback((e) => {
    // Only start selection if clicking in the chart area (not on buttons or controls)
    const chartElement = e.target.closest('.recharts-wrapper');
    if (!chartElement) return;
    
    // Don't start selection if clicking on axes text specifically
    if (e.target.tagName === 'text' && (
        e.target.closest('.recharts-xAxis') || 
        e.target.closest('.recharts-yAxis') ||
        e.target.closest('.recharts-cartesian-axis-tick')
    )) return;

    // Don't start selection if clicking on axes
    const isAxisClick = e.target.closest('.recharts-cartesian-axis') || 
                       e.target.closest('.recharts-xAxis') || 
                       e.target.closest('.recharts-yAxis') ||
                       e.target.closest('.recharts-cartesian-axis-tick') ||
                       e.target.closest('.recharts-label');
    if (isAxisClick) return;
    
    // Don't start selection if clicking on buttons or controls
    if (e.target.closest('button')) return;
    
    // Check if click is within the plotting area (not on axes) - check both X and Y
    const index = getDataIndexFromX(e.clientX, e.clientY);
    if (index === null) return; // Don't start selection if outside plotting area
    
    setIsSelecting(true);
    isDraggingRef.current = true; // Mark that we're starting a drag
    setHasMoved(false); // Reset movement tracking
    
    setSelectionStart(index);
    setSelectionEnd(index);
  }, [getDataIndexFromX]);

  // Handle mouse move - update selection
  const handleMouseMove = useCallback((e) => {
    if (!isSelecting || selectionStart === null) return;
    
    // Don't update selection if hovering over axes
    const isAxisHover = e.target.closest('.recharts-cartesian-axis') || 
                       e.target.closest('.recharts-xAxis') || 
                       e.target.closest('.recharts-yAxis') ||
                       e.target.closest('.recharts-cartesian-axis-tick') ||
                       e.target.closest('.recharts-label');
    if (isAxisHover) return;
    
    // Check if mouse is within the plotting area (check both X and Y)
    const index = getDataIndexFromX(e.clientX, e.clientY);
    
    if (index !== null) {
      // Check if mouse actually moved to a different index
      if (index !== selectionEnd) {
        setHasMoved(true);
      }
      setSelectionEnd(index);
    }
  }, [isSelecting, selectionStart, selectionEnd, getDataIndexFromX]);

  // Handle mouse up - finalize selection
  const handleMouseUp = useCallback(() => {
    if (!isSelecting) return;
    
    setIsSelecting(false);
    isDraggingRef.current = false; // Mark that drag is complete
    
    // Only create selection if mouse actually moved (dragged) and indices are different
    if (selectionStart !== null && selectionEnd !== null && hasMoved && selectionStart !== selectionEnd) {
      // Map indices from filteredData back to chartData
      let baseIndex = 0;
      
      if (selectedRange !== null) {
        // If we already have a selected range, the filteredData is a slice of chartData
        baseIndex = Math.min(selectedRange.startIndex, selectedRange.endIndex);
      } else {
        // Otherwise, calculate base index from timeRange
        if (timeRange !== 'all') {
          const months = timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12;
          baseIndex = Math.max(0, chartData.length - months);
        }
      }
      
      const startIndex = baseIndex + Math.min(selectionStart, selectionEnd);
      const endIndex = baseIndex + Math.max(selectionStart, selectionEnd);
      
      setSelectedRange({ startIndex, endIndex });
      
      // Switch to custom time range when a selection is made
      onChangeTimeRange('custom');
    }
    
    // Always clear selection state on mouse up
    setSelectionStart(null);
    setSelectionEnd(null);
    setHasMoved(false);
  }, [isSelecting, selectionStart, selectionEnd, hasMoved, selectedRange, timeRange, chartData.length, onChangeTimeRange]);

  // Clear selection when time range changes (except when switching to custom)
  useEffect(() => {
    if (timeRange !== 'custom') {
      setSelectedRange(null);
    }
  }, [timeRange]);

  // Add global mouse event listeners
  useEffect(() => {
    if (isSelecting) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isSelecting, handleMouseMove, handleMouseUp]);

  // Calculate averages and totals
  const totalSavings = filteredData.reduce((sum, month) => sum + month.savings, 0);
  const avgSavings = filteredData.length ? totalSavings / filteredData.length : 0;
  const totalSavingRate = filteredData.reduce((sum, month) => sum + month.savingRate, 0);
  const avgSavingRate = filteredData.length ? totalSavingRate / filteredData.length : 0;

  const MonthDetail = MonthDetailComponent;

  return (
    <div className="charts-container" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div className="chart-section">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '24px',
            flexWrap: 'wrap',
            gap: '16px'
          }}
        >
          <div>
            <h3 className="chart-title" style={{ marginBottom: '4px' }}>Savings Over Time</h3>
            {!selectedRange && (
              <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '4px', fontStyle: 'italic' }}>
                Click and drag on the chart to select a custom date range
              </div>
            )}
            <div style={{ fontSize: '14px', color: 'var(--color-text-tertiary)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {chartView === 'absolute' ? (
                <>
                  <div>
                    Average:{' '}
                    <span
                      style={{
                        fontWeight: 600,
                        color: getColorForPercentage((avgSavings / SAVINGS_GOAL_CHF) * 100)
                      }}
                    >
                      {new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(avgSavings)}
                    </span>
                    <span style={{ marginLeft: '8px', color: 'var(--color-text-light)' }}>
                      ({((avgSavings / SAVINGS_GOAL_CHF) * 100).toFixed(0)}% of goal)
                    </span>
                  </div>
                  <div>
                    Total:{' '}
                    <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(totalSavings)}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    Average:{' '}
                    <span
                      style={{
                        fontWeight: 600,
                        color: getColorForPercentage((avgSavingRate / SAVINGS_RATE_GOAL) * 100)
                      }}
                    >
                      {avgSavingRate.toFixed(1)}%
                    </span>
                    <span style={{ marginLeft: '8px', color: 'var(--color-text-light)' }}>
                      ({((avgSavingRate / SAVINGS_RATE_GOAL) * 100).toFixed(0)}% of goal)
                    </span>
                  </div>
                  <div>
                    Total:{' '}
                    <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {totalSavingRate.toFixed(1)}%
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="time-range-selector">
              <button
                className={`time-range-btn ${timeRange === '3m' ? 'active' : ''}`}
                onClick={() => onChangeTimeRange('3m')}
              >
                3M
              </button>
              <button
                className={`time-range-btn ${timeRange === '6m' ? 'active' : ''}`}
                onClick={() => onChangeTimeRange('6m')}
              >
                6M
              </button>
              <button
                className={`time-range-btn ${timeRange === '1y' ? 'active' : ''}`}
                onClick={() => onChangeTimeRange('1y')}
              >
                1Y
              </button>
              <button
                className={`time-range-btn ${timeRange === 'all' ? 'active' : ''}`}
                onClick={() => onChangeTimeRange('all')}
              >
                All
              </button>
              <button
                className={`time-range-btn ${timeRange === 'custom' || selectedRange !== null ? 'active' : ''}`}
                onClick={() => {
                  if (selectedRange === null) {
                    // If no selection exists, just switch to custom mode (shows all)
                    onChangeTimeRange('custom');
                  } else {
                    // If selection exists, keep it and ensure custom is selected
                    onChangeTimeRange('custom');
                  }
                }}
                title={selectedRange ? 'Custom range selected' : 'Click and drag on chart to select custom range'}
              >
                Custom
              </button>
            </div>
            <div className="chart-toggle">
              <button
                className={`chart-toggle-btn ${chartView === 'absolute' ? 'active' : ''}`}
                onClick={() => onChangeChartView('absolute')}
              >
                Absolute
              </button>
              <button
                className={`chart-toggle-btn ${chartView === 'relative' ? 'active' : ''}`}
                onClick={() => onChangeChartView('relative')}
              >
                Rate
              </button>
            </div>
            <div className="loan-payment-toggle">
              <button
                className={`chart-toggle-btn ${includeLoanPayments ? 'active' : ''}`}
                onClick={onToggleIncludeLoanPayments}
                title="Include monthly loan payments in savings calculation"
              >
                Include Loans
              </button>
            </div>
          </div>
        </div>
        <div 
          className="chart-wrapper" 
          ref={chartContainerRef}
          onMouseDown={handleMouseDown}
          style={{ position: 'relative', cursor: isSelecting ? 'crosshair' : 'default' }}
        >
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={filteredData}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              onMouseMove={(state) => {
                if (state && state.activeTooltipIndex !== undefined) {
                  setHoveredIndex(state.activeTooltipIndex);
                } else {
                  setHoveredIndex(null);
                }
              }}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={(data) => {
                // Don't trigger month selection if we're dragging or just finished dragging
                if (isSelecting || isDraggingRef.current || hasMoved) return;
                
                if (data && data.activePayload && data.activePayload[0]) {
                  const clickedData = data.activePayload[0].payload;
                  // Find the full month data from summary
                  const monthData = summary.find((m) => formatMonth(m.month) === clickedData.month);
                  if (monthData) {
                    onSelectMonth(monthData);
                    // Scroll to drilldown details after a short delay to allow rendering
                    setTimeout(() => {
                      const element = document.getElementById('drilldown-details');
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }, 100);
                  }
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-primary)" />
              <XAxis
                dataKey="month"
                tick={{ fill: 'var(--color-text-tertiary)', fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                tick={{ fill: 'var(--color-text-tertiary)', fontSize: 12 }}
                label={{
                  value: chartView === 'absolute' ? 'Savings (CHF)' : 'Savings Rate (%)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fill: 'var(--color-text-tertiary)' }
                }}
              />
              <Tooltip
                cursor={{ fill: 'transparent' }}
                contentStyle={{
                  backgroundColor: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border-primary)',
                  borderRadius: '8px',
                  padding: '12px',
                  color: 'var(--color-text-primary)',
                  boxShadow: '0 4px 12px var(--color-shadow-md)'
                }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div
                        style={{
                          backgroundColor: 'var(--color-bg-card)',
                          border: '1px solid var(--color-border-primary)',
                          borderRadius: '8px',
                          padding: '12px',
                          color: 'var(--color-text-primary)',
                          boxShadow: '0 4px 12px var(--color-shadow-md)'
                        }}
                      >
                        <p style={{ margin: 0, marginBottom: '8px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{data.month}</p>
                        {chartView === 'absolute' ? (
                          <>
                            <p
                              style={{
                                margin: 0,
                                color: getColorForPercentage((data.savings / SAVINGS_GOAL_CHF) * 100)
                              }}
                            >
                              Savings:{' '}
                              {new Intl.NumberFormat('de-CH', {
                                style: 'currency',
                                currency: 'CHF',
                                minimumFractionDigits: 2
                              }).format(data.savings)}
                            </p>
                            {includeLoanPayments && data.loanPayment > 0 && (
                              <p style={{ margin: 0, marginTop: '2px', color: '#f59e0b', fontSize: '11px' }}>
                                (includes{' '}
                                {new Intl.NumberFormat('de-CH', {
                                  style: 'currency',
                                  currency: 'CHF',
                                  minimumFractionDigits: 2
                                }).format(data.loanPayment)}{' '}
                                loan payment)
                              </p>
                            )}
                            <p style={{ margin: 0, marginTop: '4px', color: 'var(--color-text-tertiary)', fontSize: '12px' }}>
                              {((data.savings / SAVINGS_GOAL_CHF) * 100).toFixed(0)}% of goal
                            </p>
                          </>
                        ) : (
                          <>
                            <p
                              style={{
                                margin: 0,
                                color: getColorForPercentage((data.savingRate / SAVINGS_RATE_GOAL) * 100)
                              }}
                            >
                              Savings Rate: {data.savingRate.toFixed(1)}%
                            </p>
                            {includeLoanPayments && data.loanPayment > 0 && (
                              <p style={{ margin: 0, marginTop: '2px', color: '#f59e0b', fontSize: '11px' }}>
                                (includes loan payments)
                              </p>
                            )}
                            <p style={{ margin: 0, marginTop: '4px', color: 'var(--color-text-tertiary)', fontSize: '12px' }}>
                              {((data.savingRate / SAVINGS_RATE_GOAL) * 100).toFixed(0)}% of goal
                            </p>
                          </>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine y={0} stroke="var(--color-text-light)" strokeDasharray="3 3" />
              {chartView === 'absolute' && (
                <ReferenceLine
                  y={SAVINGS_GOAL_CHF}
                  stroke="#f59e0b"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  label={{
                    value: `Goal: ${new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(SAVINGS_GOAL_CHF)}`,
                    position: 'insideTopLeft',
                    fill: '#f59e0b',
                    fontSize: 12,
                    fontWeight: 600,
                    offset: 10
                  }}
                />
              )}
              {chartView === 'absolute' ? (
                <Bar dataKey="savings" radius={[8, 8, 0, 0]} name="Savings">
                  {filteredData.map((entry, index) => {
                    const percentage = (entry.savings / SAVINGS_GOAL_CHF) * 100;
                    const baseColor = getColorForPercentage(percentage);
                    
                    // Check if this bar is within the selection range
                    const isSelected = isSelecting && selectionStart !== null && selectionEnd !== null && 
                                      index >= Math.min(selectionStart, selectionEnd) && 
                                      index <= Math.max(selectionStart, selectionEnd);
                    
                    // Check if this bar is being hovered
                    const isHovered = index === hoveredIndex;
                    
                    // Make color lighter and more vibrant when selected or hovered
                    const fillColor = (isSelected || isHovered) ? lightenColor(baseColor, 0.3) : baseColor;
                    
                    return <Cell key={`cell-${index}`} fill={fillColor} />;
                  })}
                </Bar>
              ) : (
                <Bar dataKey="savingRate" radius={[8, 8, 0, 0]} name="Savings Rate (%)">
                  {filteredData.map((entry, index) => {
                    const percentage = (entry.savingRate / SAVINGS_RATE_GOAL) * 100;
                    const baseColor = getColorForPercentage(percentage);
                    
                    // Check if this bar is within the selection range
                    const isSelected = isSelecting && selectionStart !== null && selectionEnd !== null && 
                                      index >= Math.min(selectionStart, selectionEnd) && 
                                      index <= Math.max(selectionStart, selectionEnd);
                    
                    // Check if this bar is being hovered
                    const isHovered = index === hoveredIndex;
                    
                    // Make color lighter and more vibrant when selected or hovered
                    const fillColor = (isSelected || isHovered) ? lightenColor(baseColor, 0.3) : baseColor;
                    
                    return <Cell key={`cell-${index}`} fill={fillColor} />;
                  })}
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Drilldown Details */}
      {selectedMonth && (
        <div id="drilldown-details" style={{ position: 'relative', scrollMarginTop: '100px' }}>
          <button
            className="drilldown-close"
            onClick={() => onSelectMonth(null)}
            title="Close details"
          >
            ✕
          </button>
          <MonthDetail
            month={selectedMonth}
            expandedCategories={expandedCategories}
            toggleCategory={toggleCategory}
            categorySorts={categorySorts}
            toggleSort={toggleSort}
            getSortedTransactions={getSortedTransactions}
            formatCurrency={formatCurrency}
            formatMonth={formatMonth}
            formatDate={formatDate}
            handleCategoryEdit={handleCategoryEdit}
            pendingCategoryChange={pendingCategoryChange}
            showEssentialSplit={showEssentialSplit}
            essentialCategories={essentialCategories}
            categoryEditModal={categoryEditModal}
            includeLoanPayments={includeLoanPayments}
            handlePredictionClick={handlePredictionClick}
            handleDismissPrediction={handleDismissPrediction}
            setShowEssentialCategoriesModal={setShowEssentialCategoriesModal}
            defaultCurrency={defaultCurrency}
            getTransactionKey={getTransactionKey}
            allMonthsData={summary}
          />
        </div>
      )}
    </div>
  );
};

export default ChartsPage;

