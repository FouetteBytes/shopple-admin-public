import React, { useMemo } from 'react';
import {
  generateMarketInsights,
  calculatePriceCorrelation,
  detectPriceAnomalies,
  transformPriceHistoryForChart,
  exportToCSV,
  exportInsightsToJSON,
  generateComprehensiveReport,
} from '@/utils/chartUtils';
import { TrendUp, TrendDown, Warning2, TickCircle, Chart, Shop, MoneyRecive, DocumentDownload, DocumentText, Star1, DollarCircle, Clock, Category2 } from 'iconsax-react';

interface MarketInsightsPanelProps {
  priceHistory: any;
  productName?: string;
  className?: string;
}

// Helper function to get trend icon and color
const getTrendIndicator = (direction: string, changePercent: number) => {
  if (direction === 'upward') {
    return {
      icon: <TrendUp size={16} className="text-red-500" />,
      color: 'text-red-500',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200'
    };
  } else if (direction === 'downward') {
    return {
      icon: <TrendDown size={16} className="text-green-500" />,
      color: 'text-green-500',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    };
  } else {
    return {
      icon: <Chart size={16} className="text-blue-500" />,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200'
    };
  }
};

// Helper to format volatility level
const getVolatilityLevel = (volatility: number) => {
  if (volatility < 1) return { label: 'Very Low', color: 'text-green-600', bgColor: 'bg-green-100' };
  if (volatility < 2) return { label: 'Low', color: 'text-green-600', bgColor: 'bg-green-100' };
  if (volatility < 3) return { label: 'Moderate', color: 'text-yellow-600', bgColor: 'bg-yellow-100' };
  if (volatility < 4) return { label: 'High', color: 'text-orange-600', bgColor: 'bg-orange-100' };
  return { label: 'Very High', color: 'text-red-600', bgColor: 'bg-red-100' };
};

// Helper to get stability score color
const getStabilityColor = (score: number) => {
  if (score >= 8) return 'text-green-600';
  if (score >= 6) return 'text-yellow-600';
  return 'text-red-600';
};

const MarketInsightsPanel: React.FC<MarketInsightsPanelProps> = ({ 
  priceHistory, 
  productName = 'Product',
  className = '' 
}) => {
  // Enhanced data processing with comprehensive metrics
  const { 
    chartData, 
    insights, 
    anomalies, 
    comprehensiveStats,
    bestBuyAnalysis,
    marketLeadership
  } = useMemo(() => {
    const chartData = transformPriceHistoryForChart(priceHistory);
    const availableSupermarkets = Object.keys(priceHistory || {});
    const insights = generateMarketInsights(chartData, availableSupermarkets);
    
    // Detect anomalies for all supermarkets - Fix property access
    const anomalies = availableSupermarkets.flatMap(supermarket => 
      detectPriceAnomalies(chartData, supermarket, 1.5).map(anomaly => ({
        ...anomaly,
        supermarket,
        type: anomaly.severity === 'severe' ? 'spike' : 'drop', // Add missing type property
        value: anomaly.price || 0, // Add missing value property
        baseline: 0 // Add baseline for calculations
      }))
    ).slice(0, 5);
    
    // Process comprehensive statistics from backend data
    const comprehensiveStats: any = {};
    const bestBuyAnalysis: any = {};
    let marketLeadership = { winner: '', reason: '', savings: 0 };
    
    if (priceHistory && typeof priceHistory === 'object') {
      Object.entries(priceHistory).forEach(([supermarket, data]: [string, any]) => {
        if (data.monthly_records && Array.isArray(data.monthly_records)) {
          // Aggregate all monthly stats
          const allStats = data.monthly_records.map((record: any) => record.monthly_stats).filter(Boolean);
          
          if (allStats.length > 0) {
            // Calculate comprehensive averages
            const avgPrice = allStats.reduce((sum: number, stat: any) => sum + (stat.avg_price || 0), 0) / allStats.length;
            const avgVolatility = allStats.reduce((sum: number, stat: any) => sum + (stat.price_volatility || 0), 0) / allStats.length;
            const avgStability = allStats.reduce((sum: number, stat: any) => sum + (stat.price_stability_score || 0), 0) / allStats.length;
            const totalRange = allStats.reduce((sum: number, stat: any) => sum + (stat.price_range || 0), 0) / allStats.length;
            
            // Find best buy days
            const bestBuyDays = allStats.map((stat: any) => stat.best_buy_day).filter(Boolean);
            const latestTrend = allStats[allStats.length - 1]?.trend_direction || 'stable';
            
            comprehensiveStats[supermarket] = {
              avgPrice: avgPrice,
              avgVolatility: avgVolatility,
              avgStability: avgStability,
              totalRange: totalRange,
              monthsTracked: allStats.length,
              trend: latestTrend,
              bestBuyDays: bestBuyDays,
              totalChangePercent: allStats[allStats.length - 1]?.total_change_percent || 0
            };
            
            bestBuyAnalysis[supermarket] = {
              lowestPrice: Math.min(...allStats.map((s: any) => s.min_price || Infinity)),
              highestPrice: Math.max(...allStats.map((s: any) => s.max_price || 0)),
              bestDay: bestBuyDays[bestBuyDays.length - 1] || 'N/A',
              savingsOpportunity: totalRange
            };
          }
        }
      });
      
      // Determine market leader
      const supermarketStats = Object.entries(comprehensiveStats);
      if (supermarketStats.length > 0) {
        const winner = supermarketStats.reduce((best: any, [name, stats]: [string, any]) => {
          const score = stats.avgPrice * -1 + stats.avgStability * 10; // Lower price + higher stability = better
          return score > best.score ? { name, score, stats } : best;
        }, { name: '', score: -Infinity, stats: null });
        
        if (winner.name) {
          const bestStats = winner.stats;
          const worstPrice = Math.max(...supermarketStats.map(([_, stats]: [string, any]) => stats.avgPrice));
          marketLeadership = {
            winner: winner.name,
            reason: `Lowest average price with high stability`,
            savings: worstPrice - bestStats.avgPrice
          };
        }
      }
    }
    
    return { 
      chartData, 
      insights, 
      anomalies, 
      comprehensiveStats,
      bestBuyAnalysis,
      marketLeadership
    };
  }, [priceHistory]);

  if (!chartData.length && Object.keys(comprehensiveStats).length === 0) {
    return (
      <div className={`bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-6 ${className}`}>
        <div className="text-center text-gray-500">
          <Chart size={48} className="mx-auto mb-3 opacity-50" />
          <p>No market data available for insights</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gradient-to-br from-white to-blue-50 rounded-2xl border border-blue-100 shadow-lg ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-2xl p-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Chart size={24} className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white"> Smart Market Intelligence</h3>
              <p className="text-blue-100 text-sm">Complete price analysis with actionable insights</p>
            </div>
          </div>
          
          {/* Export Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => exportToCSV(chartData, `${productName?.toLowerCase().replace(/\s+/g, '_') || 'product'}_price_data`)}
              className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-white text-sm font-medium"
              title="Export to CSV"
            >
              <DocumentDownload size={16} />
              CSV
            </button>
            <button
              onClick={() => exportInsightsToJSON(insights, chartData, `${productName?.toLowerCase().replace(/\s+/g, '_') || 'product'}_insights`)}
              className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-white text-sm font-medium"
              title="Export Insights"
            >
              <DocumentText size={16} />
              Report
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Market Leadership Section */}
        {marketLeadership.winner && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 bg-green-500 rounded-xl flex items-center justify-center">
                <Star1 size={20} className="text-white" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-green-900"> Market Leader</h4>
                <p className="text-green-700 text-sm">{marketLeadership.reason}</p>
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-green-200">
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600 font-medium">Winner</p>
                  <p className="text-xl font-bold text-green-600 capitalize">{marketLeadership.winner}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 font-medium">Your Savings</p>
                  <p className="text-xl font-bold text-green-600">Rs {marketLeadership.savings.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 font-medium">Best Coverage & Pricing</p>
                  <p className="text-sm text-green-700">Consistently lowest prices</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Market Analysis Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {Object.entries(comprehensiveStats).map(([supermarket, stats]: [string, any]) => {
            const trend = getTrendIndicator(stats.trend, stats.totalChangePercent);
            const volatility = getVolatilityLevel(stats.avgVolatility);
            const bestBuy = bestBuyAnalysis[supermarket];
            
            return (
              <div key={supermarket} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
                {/* Store Header */}
                <div className={`p-4 ${trend.bgColor} ${trend.borderColor} border-b`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shop size={20} className="text-gray-700" />
                      <h5 className="font-bold text-gray-900 capitalize">{supermarket}</h5>
                    </div>
                    <div className="flex items-center gap-1">
                      {trend.icon}
                      <span className={`text-xs font-medium ${trend.color}`}>
                        {stats.totalChangePercent > 0 ? '+' : ''}{stats.totalChangePercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Avg Price</p>
                      <p className="text-lg font-bold text-blue-900">Rs {stats.avgPrice.toFixed(2)}</p>
                    </div>
                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                      <p className="text-xs text-purple-600 font-medium uppercase tracking-wide">Range</p>
                      <p className="text-lg font-bold text-purple-900">Rs {stats.totalRange.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Stability & Volatility */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Price Stability</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${getStabilityColor(stats.avgStability).includes('green') ? 'bg-green-500' : getStabilityColor(stats.avgStability).includes('yellow') ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${(stats.avgStability / 10) * 100}%` }}
                          ></div>
                        </div>
                        <span className={`text-sm font-medium ${getStabilityColor(stats.avgStability)}`}>
                          {stats.avgStability.toFixed(1)}/10
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Volatility</span>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${volatility.bgColor} ${volatility.color}`}>
                        {volatility.label}
                      </span>
                    </div>
                  </div>

                  {/* Best Buy Info */}
                  <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarCircle size={16} className="text-yellow-600" />
                      <span className="text-sm font-medium text-yellow-800">Best Buy Opportunity</span>
                    </div>
                    <div className="text-xs text-yellow-700 space-y-1">
                      <div className="flex justify-between">
                        <span>Lowest Price:</span>
                        <span className="font-medium">Rs {bestBuy?.lowestPrice?.toFixed(2) || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Last Best Day:</span>
                        <span className="font-medium">{bestBuy?.bestDay?.split('-').reverse().join('/') || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Potential Savings:</span>
                        <span className="font-medium text-green-600">Rs {bestBuy?.savingsOpportunity?.toFixed(2) || '0'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Monthly Tracking */}
                  <div className="text-center pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-500">
                       {stats.monthsTracked} months tracked • {stats.trend} trend
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Enhanced Price Anomalies Section */}
        {anomalies.length > 0 && (
          <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 bg-orange-500 rounded-xl flex items-center justify-center">
                <Warning2 size={20} className="text-white" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-orange-900"> Smart Price Alerts</h4>
                <p className="text-orange-700 text-sm">Unusual price movements that need your attention</p>
              </div>
            </div>
            
            <div className="space-y-3">
              {anomalies.slice(0, 3).map((anomaly: any, index: number) => (
                <div key={index} className="bg-white rounded-lg p-4 border border-orange-200 hover:border-orange-300 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Shop size={16} className="text-gray-600" />
                        <span className="font-medium capitalize text-gray-900">{anomaly.supermarket}</span>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          anomaly.type === 'spike' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                        }`}>
                          {anomaly.type === 'spike' ? ' Price Spike' : ' Price Drop'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Rs {anomaly.value.toFixed(2)}</span> on {new Date(anomaly.date).toLocaleDateString()}
                        {anomaly.type === 'spike' ? ' (unusually high)' : ' (unusually low)'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                         {anomaly.type === 'spike' 
                          ? 'Consider waiting for price to normalize or check other stores' 
                          : 'Great opportunity! Consider stocking up if this is a regular purchase'
                        }
                      </p>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${anomaly.type === 'spike' ? 'text-red-600' : 'text-green-600'}`}>
                        {anomaly.type === 'spike' ? '+' : ''}Rs {(anomaly.value - anomaly.baseline || 0).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500">vs normal</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {anomalies.length > 3 && (
              <div className="text-center pt-3 border-t border-orange-200 mt-4">
                <p className="text-sm text-orange-700">
                  +{anomalies.length - 3} more anomalies detected in historical data
                </p>
              </div>
            )}
          </div>
        )}

        {/* Market Trend Analysis */}
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 bg-purple-500 rounded-xl flex items-center justify-center">
              <TrendUp size={20} className="text-white" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-purple-900"> Market Trend Analysis</h4>
              <p className="text-purple-700 text-sm">Overall market patterns and shopping recommendations</p>
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-purple-200">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl mb-2"></div>
                <h5 className="font-medium text-gray-900 mb-1">Best Value</h5>
                <p className="text-sm text-gray-600 capitalize">{marketLeadership.winner || 'Calculating...'}</p>
                <p className="text-xs text-green-600 font-medium">Lowest average prices</p>
              </div>
              <div className="text-center">
                <div className="text-2xl mb-2">⚡</div>
                <h5 className="font-medium text-gray-900 mb-1">Most Volatile</h5>
                <p className="text-sm text-gray-600 capitalize">
                  {Object.entries(comprehensiveStats).reduce((most: any, [name, stats]: [string, any]) => 
                    !most || stats.avgVolatility > most.volatility ? { name, volatility: stats.avgVolatility } : most
                  , null)?.name || 'Calculating...'}
                </p>
                <p className="text-xs text-orange-600 font-medium">Highest price fluctuation</p>
              </div>
              <div className="text-center">
                <div className="text-2xl mb-2"></div>
                <h5 className="font-medium text-gray-900 mb-1">Market Trend</h5>
                <p className="text-sm text-gray-600">
                  {Object.values(comprehensiveStats).some((stats: any) => stats.trend === 'upward') 
                    ? 'Rising Prices' : 'Stable Market'}
                </p>
                <p className="text-xs text-blue-600 font-medium">Overall direction</p>
              </div>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong> Smart Shopping Tip:</strong> Based on the data, shop at <strong className="capitalize">{marketLeadership.winner}</strong> for the best value. 
              Watch for price drops around {Object.values(bestBuyAnalysis).some((analysis: any) => analysis.bestDay !== 'N/A') ? 'month-end periods' : 'weekends'} for maximum savings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketInsightsPanel;
