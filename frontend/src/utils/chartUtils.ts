/**
 * Chart utilities for VisActor VChart integration.
 * Handles data transformation and chart configuration for price history visualization.
 */

export interface PriceDataPoint {
  date: string;
  price: number;
  supermarket: string;
}

export interface TransformedChartData {
  date: string;
  keells?: number;
  cargills?: number;
  arpico?: number;
  [key: string]: any;
}

export interface SupermarketColors {
  [key: string]: {
    fill: string;
    stroke: string;
  };
}

// Color scheme aligned with the application theme.
export const SUPERMARKET_COLORS: SupermarketColors = {
  keells: {
    fill: 'rgba(59, 130, 246, 0.4)', // Blue with opacity.
    stroke: '#3b82f6'
  },
  cargills: {
    fill: 'rgba(16, 185, 129, 0.4)', // Green with opacity.
    stroke: '#10b981'
  },
  arpico: {
    fill: 'rgba(245, 101, 101, 0.4)', // Red with opacity.
    stroke: '#f56565'
  }
};

/**
 * Transform price history data from backend format to a VChart-compatible format.
 * Converts daily prices from multiple supermarkets into a unified timeline.
 */
export const transformPriceHistoryForChart = (priceHistory: any): TransformedChartData[] => {
  console.log(' Transform Input:', priceHistory);
  
  if (!priceHistory || typeof priceHistory !== 'object') {
    console.warn('❌ Invalid price history input');
    return [];
  }

  // Collect all unique dates across supermarkets.
  const allDates = new Set<string>();
  const supermarketData: { [supermarket: string]: { [date: string]: number } } = {};

  // Extract daily prices from each supermarket.
  Object.entries(priceHistory).forEach(([supermarket, data]: [string, any]) => {
    console.log(` Processing ${supermarket}:`, data);
    
    if (data && data.daily_prices && Array.isArray(data.daily_prices)) {
      supermarketData[supermarket] = {};
      
      data.daily_prices.forEach((entry: any, index: number) => {
        if (entry.date && typeof entry.price === 'number') {
          // Ensure the date uses YYYY-MM-DD format.
          let normalizedDate: string;
          if (typeof entry.date === 'string') {
            // Check whether the date is already in YYYY-MM-DD format.
            if (/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
              normalizedDate = entry.date;
            } else {
              // Attempt to parse and reformat.
              const dateObj = new Date(entry.date);
              if (!isNaN(dateObj.getTime())) {
                normalizedDate = dateObj.toISOString().split('T')[0];
              } else {
                console.warn(`⚠️ Invalid date for ${supermarket}[${index}]:`, entry.date);
                return; // Skip invalid dates.
              }
            }
          } else {
            // Handle timestamp or Date object values.
            const dateObj = new Date(entry.date);
            if (!isNaN(dateObj.getTime())) {
              normalizedDate = dateObj.toISOString().split('T')[0];
            } else {
              console.warn(`⚠️ Invalid date object for ${supermarket}[${index}]:`, entry.date);
              return; // Skip invalid dates.
            }
          }
          
          allDates.add(normalizedDate);
          supermarketData[supermarket][normalizedDate] = entry.price;
          
          if (index < 3) { // Log the first few entries for debugging.
            console.log(`✅ ${supermarket} date processed: ${entry.date} -> ${normalizedDate}, price: ${entry.price}`);
          }
        } else {
          console.warn(`⚠️ Invalid entry for ${supermarket}[${index}]:`, entry);
        }
      });
    } else {
      console.warn(`⚠️ No daily_prices for ${supermarket}`);
    }
  });

  console.log(' All unique dates:', Array.from(allDates).sort());
  console.log(' Supermarket data keys:', Object.keys(supermarketData));

  // Convert to chart format with all dates.
  const chartData: TransformedChartData[] = Array.from(allDates)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    .map(date => {
      const dataPoint: TransformedChartData = { date };
      
      // Add price data for each supermarket, if available for the date.
      Object.keys(supermarketData).forEach(supermarket => {
        const price = supermarketData[supermarket][date];
        if (price !== undefined) {
          dataPoint[supermarket] = price;
        }
      });
      
      return dataPoint;
    });

  console.log(' Final chart data:', chartData.slice(0, 5));
  console.log(`✅ Transformed ${chartData.length} data points`);

  return chartData;
};

/**
 * Transform current prices for comparison charts.
 */
export const transformCurrentPricesForChart = (currentPrices: any[]): any[] => {
  if (!currentPrices || !Array.isArray(currentPrices)) return [];
  
  return currentPrices.map(price => ({
    supermarket: price.supermarketId,
    price: price.price,
    lastUpdated: price.lastUpdated
  }));
};

/**
 * Generate VChart area series configuration for each supermarket.
 */
export const generateAreaSeries = (availableSupermarkets: string[]) => {
  return availableSupermarkets.map(supermarket => ({
    type: 'area',
    data: {
      id: `${supermarket}_data`,
    },
    xField: 'date',
    yField: supermarket,
    seriesField: 'type',
    stack: false, // Overlapping areas, not stacked.
    area: {
      style: {
        fill: SUPERMARKET_COLORS[supermarket]?.fill || 'rgba(99, 102, 241, 0.4)',
        fillOpacity: 0.4,
      }
    },
    line: {
      style: {
        stroke: SUPERMARKET_COLORS[supermarket]?.stroke || '#6366f1',
        lineWidth: 2,
      }
    },
    point: {
      style: {
        fill: SUPERMARKET_COLORS[supermarket]?.stroke || '#6366f1',
        stroke: '#ffffff',
        strokeWidth: 2,
        size: 4,
      },
      state: {
        hover: {
          size: 6,
          stroke: SUPERMARKET_COLORS[supermarket]?.stroke || '#6366f1',
          strokeWidth: 3,
        }
      }
    },
    label: {
      visible: false, // Hide labels to reduce clutter.
    }
  }));
};

/**
 * Calculate price statistics for display.
 */
export const calculatePriceStats = (chartData: TransformedChartData[], supermarkets: string[]) => {
  if (!chartData.length) return null;

  const stats: any = {};
  
  supermarkets.forEach(supermarket => {
    const prices = chartData
      .map(d => d[supermarket])
      .filter(price => price !== undefined) as number[];
    
    if (prices.length > 0) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const avg = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      const latest = prices[prices.length - 1];
      const first = prices[0];
      const change = ((latest - first) / first) * 100;

      stats[supermarket] = {
        min,
        max,
        avg,
        latest,
        change,
        dataPoints: prices.length
      };
    }
  });

  return stats;
};

/**
 * Format a price for display.
 */
export const formatPrice = (price: number): string => {
  return `Rs ${price.toFixed(2)}`;
};

/**
 * Format percentage change values.
 */
export const formatChange = (change: number): string => {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
};

/**
 * Get trend direction based on change percentage.
 */
export const getTrendDirection = (change: number): 'up' | 'down' | 'stable' => {
  if (change > 2) return 'up';
  if (change < -2) return 'down';
  return 'stable';
};

/**
 * Generate a color palette for multiple series.
 */
export const generateColorPalette = (count: number): string[] => {
  const baseColors = [
    '#3b82f6', // Blue.
    '#10b981', // Green.
    '#f59e0b', // Yellow.
    '#ef4444', // Red.
    '#8b5cf6', // Purple.
    '#06b6d4', // Cyan.
    '#84cc16', // Lime.
    '#f97316', // Orange.
    '#ec4899', // Pink.
    '#6b7280'  // Gray.
  ];
  
  if (count <= baseColors.length) {
    return baseColors.slice(0, count);
  }
  
  // Generate additional colors if needed.
  const colors = [...baseColors];
  for (let i = baseColors.length; i < count; i++) {
    const hue = (i * 137.508) % 360; // Golden angle approximation.
    colors.push(`hsl(${hue}, 70%, 50%)`);
  }
  
  return colors;
};

/**
 * Calculate a price volatility score (0-100, lower is more stable).
 */
export const calculateVolatilityScore = (prices: number[]): number => {
  if (prices.length < 2) return 0;
  
  const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
  const standardDeviation = Math.sqrt(variance);
  const coefficientOfVariation = (standardDeviation / mean) * 100;
  
  return Math.min(Math.round(coefficientOfVariation), 100);
};

/**
 * Find the best price period within the date range.
 */
export const findBestPricePeriod = (chartData: TransformedChartData[], supermarket: string, days: number = 7): {
  startDate: string;
  endDate: string;
  avgPrice: number;
  minPrice: number;
} | null => {
  const supermarketPrices = chartData
    .filter(d => d[supermarket] !== undefined)
    .map(d => ({ date: d.date, price: d[supermarket] as number }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  if (supermarketPrices.length < days) return null;
  
  let bestPeriod = null;
  let bestAvgPrice = Infinity;
  
  for (let i = 0; i <= supermarketPrices.length - days; i++) {
    const periodData = supermarketPrices.slice(i, i + days);
    const avgPrice = periodData.reduce((sum, d) => sum + d.price, 0) / days;
    const minPrice = Math.min(...periodData.map(d => d.price));
    
    if (avgPrice < bestAvgPrice) {
      bestAvgPrice = avgPrice;
      bestPeriod = {
        startDate: periodData[0].date,
        endDate: periodData[periodData.length - 1].date,
        avgPrice,
        minPrice
      };
    }
  }
  
  return bestPeriod;
};

/**
 * Generate a recommendation based on price analysis.
 */
export const generatePriceRecommendation = (
  priceStats: any, 
  currentPrices: any[]
): {
  recommendation: 'buy' | 'wait' | 'monitor';
  reason: string;
  bestStore: string;
  confidence: number;
} => {
  if (!priceStats || !currentPrices.length) {
    return {
      recommendation: 'monitor',
      reason: 'Insufficient data for recommendation',
      bestStore: '',
      confidence: 0
    };
  }
  
  // Identify the current best price.
  const sortedPrices = currentPrices.sort((a, b) => a.price - b.price);
  const bestStore = sortedPrices[0].supermarketId;
  const bestPrice = sortedPrices[0].price;
  
  // Retrieve historical statistics for the best store.
  const storeStats = priceStats[bestStore];
  if (!storeStats) {
    return {
      recommendation: 'monitor',
      reason: 'No historical data for current best store',
      bestStore,
      confidence: 30
    };
  }
  
  const { min, avg, change } = storeStats;
  const pricePosition = ((bestPrice - min) / (avg - min)) * 100;
  
  let recommendation: 'buy' | 'wait' | 'monitor' = 'monitor';
  let reason = '';
  let confidence = 50;
  
  if (pricePosition <= 20 && change <= 0) {
    recommendation = 'buy';
    reason = 'Price is near historical low and trending stable/down';
    confidence = 85;
  } else if (pricePosition <= 40 && change < 5) {
    recommendation = 'buy';
    reason = 'Good price compared to historical average';
    confidence = 70;
  } else if (pricePosition >= 80 || change > 10) {
    recommendation = 'wait';
    reason = 'Price is high compared to historical data';
    confidence = 75;
  } else {
    recommendation = 'monitor';
    reason = 'Price is in normal range, monitor for better deals';
    confidence = 60;
  }
  
  return { recommendation, reason, bestStore, confidence };
};

/**
 * Format a date for display.
 */
export const formatDateForDisplay = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

/**
 * Calculate price trends over time periods.
 */
export const calculatePriceTrends = (chartData: TransformedChartData[], supermarket: string): {
  weekly?: number;
  monthly?: number;
  overall?: number;
} => {
  const prices = chartData
    .filter(d => d[supermarket] !== undefined)
    .map(d => ({ date: new Date(d.date), price: d[supermarket] as number }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  
  if (prices.length < 2) return {};
  
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const weeklyPrices = prices.filter(p => p.date >= weekAgo);
  const monthlyPrices = prices.filter(p => p.date >= monthAgo);
  
  const calculateTrend = (data: typeof prices) => {
    if (data.length < 2) return undefined;
    const first = data[0].price;
    const last = data[data.length - 1].price;
    return ((last - first) / first) * 100;
  };
  
  return {
    weekly: calculateTrend(weeklyPrices),
    monthly: calculateTrend(monthlyPrices),
    overall: calculateTrend(prices)
  };
};

/**
 * Advanced chart enhancement utilities.
 */

/**
 * Smooth data using a moving average for trend visualization.
 */
export const smoothDataWithMovingAverage = (
  chartData: TransformedChartData[], 
  supermarket: string, 
  windowSize: number = 3
): TransformedChartData[] => {
  if (!chartData.length || windowSize < 2) return chartData;
  
  const smoothedData = [...chartData];
  const prices = chartData.map(d => d[supermarket]).filter(p => p !== undefined) as number[];
  
  for (let i = windowSize - 1; i < chartData.length; i++) {
    const windowStart = Math.max(0, i - windowSize + 1);
    const windowData = prices.slice(windowStart, i + 1);
    const average = windowData.reduce((sum, price) => sum + price, 0) / windowData.length;
    
    if (smoothedData[i][supermarket] !== undefined) {
      smoothedData[i][`${supermarket}_smooth`] = average;
    }
  }
  
  return smoothedData;
};

/**
 * Detect price anomalies using statistical methods.
 */
export const detectPriceAnomalies = (
  chartData: TransformedChartData[], 
  supermarket: string,
  threshold: number = 2
): { date: string; price: number; severity: 'mild' | 'moderate' | 'severe' }[] => {
  const prices = chartData
    .filter(d => d[supermarket] !== undefined)
    .map(d => ({ date: d.date, price: d[supermarket] as number }));
  
  if (prices.length < 5) return [];
  
  const priceValues = prices.map(p => p.price);
  const mean = priceValues.reduce((sum, price) => sum + price, 0) / priceValues.length;
  const variance = priceValues.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / priceValues.length;
  const standardDeviation = Math.sqrt(variance);
  
  const anomalies = prices
    .map(({ date, price }) => {
      const zScore = Math.abs(price - mean) / standardDeviation;
      if (zScore > threshold) {
        let severity: 'mild' | 'moderate' | 'severe' = 'mild';
        if (zScore > threshold * 2) severity = 'severe';
        else if (zScore > threshold * 1.5) severity = 'moderate';
        
        return { date, price, severity };
      }
      return null;
    })
    .filter(Boolean) as { date: string; price: number; severity: 'mild' | 'moderate' | 'severe' }[];
  
  return anomalies;
};

/**
 * Calculate correlation between supermarket prices.
 */
export const calculatePriceCorrelation = (
  chartData: TransformedChartData[], 
  supermarket1: string, 
  supermarket2: string
): number => {
  const pairs = chartData
    .filter(d => d[supermarket1] !== undefined && d[supermarket2] !== undefined)
    .map(d => ({ x: d[supermarket1] as number, y: d[supermarket2] as number }));
  
  if (pairs.length < 3) return 0;
  
  const n = pairs.length;
  const sumX = pairs.reduce((sum, p) => sum + p.x, 0);
  const sumY = pairs.reduce((sum, p) => sum + p.y, 0);
  const sumXY = pairs.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumX2 = pairs.reduce((sum, p) => sum + p.x * p.x, 0);
  const sumY2 = pairs.reduce((sum, p) => sum + p.y * p.y, 0);
  
  const correlation = (n * sumXY - sumX * sumY) / 
    Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  return isNaN(correlation) ? 0 : correlation;
};

/**
 * Generate market insights based on comprehensive analysis.
 */
export const generateMarketInsights = (
  chartData: TransformedChartData[], 
  availableSupermarkets: string[]
): {
  marketLeader: string;
  mostVolatile: string;
  bestValue: string;
  priceGaps: Array<{ supermarket1: string; supermarket2: string; avgDifference: number }>;
  trendAnalysis: string;
} => {
  if (!chartData.length || !availableSupermarkets.length) {
    return {
      marketLeader: '',
      mostVolatile: '',
      bestValue: '',
      priceGaps: [],
      trendAnalysis: 'Insufficient data for analysis'
    };
  }
  
  const stats = calculatePriceStats(chartData, availableSupermarkets);
  if (!stats) {
    return {
      marketLeader: '',
      mostVolatile: '',
      bestValue: '',
      priceGaps: [],
      trendAnalysis: 'No price statistics available'
    };
  }
  
  // Determine the market leader based on coverage and pricing.
  let marketLeader = '';
  let bestScore = -1;
  
  availableSupermarkets.forEach(supermarket => {
    const stat = stats[supermarket];
    if (stat) {
      const score = stat.dataPoints * 0.6 + (1 / stat.avg) * 1000 * 0.4;
      if (score > bestScore) {
        bestScore = score;
        marketLeader = supermarket;
      }
    }
  });
  
  // Identify the most volatile retailer.
  let mostVolatile = '';
  let highestVolatility = -1;
  
  availableSupermarkets.forEach(supermarket => {
    const prices = chartData
      .map(d => d[supermarket])
      .filter(p => p !== undefined) as number[];
    
    const volatility = calculateVolatilityScore(prices);
    if (volatility > highestVolatility) {
      highestVolatility = volatility;
      mostVolatile = supermarket;
    }
  });
  
  // Identify the best value based on average price.
  let bestValue = '';
  let lowestAvg = Infinity;
  
  availableSupermarkets.forEach(supermarket => {
    const stat = stats[supermarket];
    if (stat && stat.avg < lowestAvg) {
      lowestAvg = stat.avg;
      bestValue = supermarket;
    }
  });
  
  // Calculate price gaps between supermarkets.
  const priceGaps: Array<{ supermarket1: string; supermarket2: string; avgDifference: number }> = [];
  
  for (let i = 0; i < availableSupermarkets.length; i++) {
    for (let j = i + 1; j < availableSupermarkets.length; j++) {
      const sm1 = availableSupermarkets[i];
      const sm2 = availableSupermarkets[j];
      const stat1 = stats[sm1];
      const stat2 = stats[sm2];
      
      if (stat1 && stat2) {
        priceGaps.push({
          supermarket1: sm1,
          supermarket2: sm2,
          avgDifference: Math.abs(stat1.avg - stat2.avg)
        });
      }
    }
  }
  
  // Generate trend analysis.
  let trendAnalysis = 'Market showing ';
  const recentData = chartData.slice(-7); // Last seven data points.
  const trends = availableSupermarkets.map(sm => {
    const recentPrices = recentData
      .map(d => d[sm])
      .filter(p => p !== undefined) as number[];
    
    if (recentPrices.length >= 2) {
      const change = ((recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0]) * 100;
      return change;
    }
    return 0;
  });
  
  const avgTrend = trends.reduce((sum, trend) => sum + trend, 0) / trends.length;
  
  if (avgTrend > 2) {
    trendAnalysis += 'upward price pressure across most retailers';
  } else if (avgTrend < -2) {
    trendAnalysis += 'downward price trends - good time to buy';
  } else {
    trendAnalysis += 'stable pricing with minimal fluctuations';
  }
  
  return {
    marketLeader,
    mostVolatile,
    bestValue,
    priceGaps: priceGaps.sort((a, b) => b.avgDifference - a.avgDifference).slice(0, 3),
    trendAnalysis
  };
};

/**
 * Generate a VChart theme configuration.
 */
export const generateModernChartTheme = () => ({
  background: 'transparent',
  padding: { top: 20, right: 20, bottom: 40, left: 60 },
  color: [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6b7280'
  ],
  fontFamily: 'Inter, system-ui, sans-serif',
  mark: {
    area: {
      fillOpacity: 0.3,
      strokeWidth: 2
    },
    line: {
      strokeWidth: 3,
      strokeLinecap: 'round',
      strokeLinejoin: 'round'
    },
    point: {
      size: 5,
      strokeWidth: 2,
      fill: '#ffffff'
    }
  },
  axis: {
    grid: {
      stroke: '#f1f5f9',
      strokeWidth: 1
    },
    tick: {
      stroke: '#cbd5e1',
      strokeWidth: 1
    },
    label: {
      fontSize: 12,
      fill: '#64748b',
      fontWeight: 500
    },
    title: {
      fontSize: 14,
      fill: '#1e293b',
      fontWeight: 600
    }
  },
  legend: {
    item: {
      label: {
        fontSize: 12,
        fill: '#475569',
        fontWeight: 500
      }
    }
  },
  tooltip: {
    style: {
      panel: {
        padding: 12,
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
        fontSize: 13
      }
    }
  }
});

/**
 * Data export utilities for chart data.
 */

/**
 * Export chart data to CSV format.
 */
export const exportToCSV = (
  chartData: TransformedChartData[], 
  filename: string = 'price_history'
): void => {
  if (!chartData.length) return;
  
  // Get all supermarket columns.
  const supermarkets = Object.keys(chartData[0]).filter(key => key !== 'date');
  
  // Create the CSV header.
  const headers = ['Date', ...supermarkets.map(sm => `${sm.charAt(0).toUpperCase() + sm.slice(1)} Price`)];
  
  // Create CSV rows.
  const rows = chartData.map(row => [
    row.date,
    ...supermarkets.map(sm => row[sm] !== undefined ? `Rs ${row[sm]?.toFixed(2)}` : '')
  ]);
  
  // Combine headers and rows.
  const csvContent = [headers, ...rows]
    .map(row => row.map(field => `"${field}"`).join(','))
    .join('\n');
  
  // Create and download the file.
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Export market insights to JSON format.
 */
export const exportInsightsToJSON = (
  insights: any,
  chartData: TransformedChartData[],
  filename: string = 'market_insights'
): void => {
  const exportData = {
    generatedAt: new Date().toISOString(),
    insights,
    dataPoints: chartData.length,
    dateRange: {
      from: chartData.length > 0 ? chartData[0].date : null,
      to: chartData.length > 0 ? chartData[chartData.length - 1].date : null
    },
    rawData: chartData
  };
  
  const jsonContent = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.json`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Generate a comprehensive report combining insights and recommendations.
 */
export const generateComprehensiveReport = (
  chartData: TransformedChartData[],
  insights: any,
  productName: string
): string => {
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  return `
# Market Analysis Report - ${productName}
Generated on: ${reportDate}

## Executive Summary
This comprehensive analysis covers ${chartData.length} data points across multiple supermarkets.

### Key Findings:
- **Market Leader**: ${insights.marketLeader} (Best coverage and competitive pricing)
- **Best Value Store**: ${insights.bestValue} (Lowest average prices)
- **Most Volatile**: ${insights.mostVolatile} (Highest price fluctuations)

### Market Trend Analysis
${insights.trendAnalysis}

## Price Gap Analysis
${insights.priceGaps.length > 0 ? 
  insights.priceGaps.map((gap: any, index: number) => 
    `${index + 1}. ${gap.supermarket1} vs ${gap.supermarket2}: Rs ${gap.avgDifference.toFixed(2)} average difference`
  ).join('\n') : 
  'No significant price gaps detected.'
}

## Data Quality
- Total Data Points: ${chartData.length}
- Date Range: ${chartData.length > 0 ? `${chartData[0].date} to ${chartData[chartData.length - 1].date}` : 'No data'}
- Coverage: ${Object.keys(chartData[0] || {}).filter(k => k !== 'date').length} supermarkets tracked

## Recommendations
Based on the analysis, consumers should:
1. Monitor ${insights.bestValue} for the best regular prices
2. Be cautious of ${insights.mostVolatile} due to price volatility
3. Consider ${insights.marketLeader} for consistent availability and competitive pricing

---
*This report was generated automatically by the Price Intelligence System*
  `.trim();
};
