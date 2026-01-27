import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface PriceHistoryChartProps {
  priceHistory: any;
  productName: string;
  className?: string;
}

const PriceHistoryChart: React.FC<PriceHistoryChartProps> = ({ 
  priceHistory, 
  productName, 
  className = '' 
}) => {
  // Enhanced data processing for multi-store, multi-month price data structure
  const chartData = React.useMemo(() => {
    const dataMap = new Map<string, any>();
    const supermarkets = new Set<string>();
    
    console.log(' PriceHistoryChart - Raw data received:', { priceHistory });
    
    // Process historical data from backend structure (same as PriceIntelligenceChart)
    if (priceHistory && typeof priceHistory === 'object') {
      Object.entries(priceHistory).forEach(([supermarket, storeData]: [string, any]) => {
        console.log(` Processing ${supermarket} historical data for AreaChart:`, storeData);
        supermarkets.add(supermarket);
        
        // Process daily_prices array (main historical data)
        if (storeData.daily_prices && Array.isArray(storeData.daily_prices)) {
          storeData.daily_prices.forEach((entry: any) => {
            const dateKey = entry.date;
            if (!dataMap.has(dateKey)) {
              dataMap.set(dateKey, { 
                date: dateKey, 
                timestamp: new Date(dateKey).getTime() 
              });
            }
            const dataPoint = dataMap.get(dateKey);
            dataPoint[supermarket] = entry.price;
          });
        }
        
        // Also process monthly_records for comprehensive data coverage
        if (storeData.monthly_records && Array.isArray(storeData.monthly_records)) {
          storeData.monthly_records.forEach((monthRecord: any) => {
            if (monthRecord.daily_prices && typeof monthRecord.daily_prices === 'object') {
              Object.entries(monthRecord.daily_prices).forEach(([date, price]: [string, any]) => {
                if (!dataMap.has(date)) {
                  dataMap.set(date, { 
                    date: date, 
                    timestamp: new Date(date).getTime() 
                  });
                }
                const dataPoint = dataMap.get(date);
                dataPoint[supermarket] = price;
              });
            }
          });
        }
      });
    }
    
    // Only show real data, no sample generation
    if (dataMap.size === 0) {
      console.log('⚠️ No real data available for PriceHistoryChart');
      return [];
    }
    
    // Convert to array and sort by date
    const result = Array.from(dataMap.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(item => {
        const { timestamp, ...rest } = item;
        return rest;
      });
    
    console.log(' Final AreaChart data:', result);
    console.log(' Available supermarkets for AreaChart:', Array.from(supermarkets));
    return result;
  }, [priceHistory]);

  const colors: { [key: string]: string } = {
    keells: '#3b82f6',
    cargills: '#10b981', 
    arpico: '#f59e0b',
    food_city: '#ef4444',
    laugfs: '#8b5cf6'
  };

  // Get unique supermarkets from the data
  const availableSupermarkets = React.useMemo(() => {
    const supermarkets = new Set<string>();
    chartData.forEach(dataPoint => {
      Object.keys(dataPoint).forEach(key => {
        if (key !== 'date' && dataPoint[key] !== undefined) {
          supermarkets.add(key);
        }
      });
    });
    return Array.from(supermarkets);
  }, [chartData]);

  if (chartData.length === 0) {
    return (
      <div className={`${className} bg-white border rounded-xl p-6`}>
        <h4 className="text-lg font-semibold text-gray-900 mb-4">
          Traditional Price History - {productName}
        </h4>
        <div className="flex items-center justify-center h-64 text-gray-500">
          <div className="text-center">
            <div className="text-4xl mb-2"></div>
            <p className="text-lg mb-1">No Historical Data Available</p>
            <p className="text-sm">Upload price data to see historical trends</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} bg-white border rounded-xl p-6`}>
      <h4 className="text-lg font-semibold text-gray-900 mb-6">
        Traditional Price History - {productName}
      </h4>
      
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 12 }}
            tickFormatter={(date) => {
              const d = new Date(date);
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }}
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => `Rs ${value}`}
          />
          <Tooltip 
            formatter={(value: any, name: string) => [`Rs ${value}`, name.charAt(0).toUpperCase() + name.slice(1)]}
            labelFormatter={(date) => {
              const d = new Date(date);
              return d.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              });
            }}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #ccc',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
          />
          <Legend />
          {availableSupermarkets.map((supermarket) => (
            <Area
              key={supermarket}
              type="monotone"
              dataKey={supermarket}
              stackId={supermarket}
              stroke={colors[supermarket] || '#6366f1'}
              fill={`${colors[supermarket] || '#6366f1'}20`}
              strokeWidth={2}
              fillOpacity={0.3}
              connectNulls={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      {/* Monthly Summary */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {availableSupermarkets.map(supermarket => {
          const prices = chartData
            .map(item => item[supermarket])
            .filter(price => price !== undefined);
          
          if (prices.length === 0) return null;
          
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          const firstPrice = prices[0];
          const lastPrice = prices[prices.length - 1];
          const priceChange = lastPrice - firstPrice;
          const changePercent = (priceChange / firstPrice) * 100;
          
          return (
            <div key={supermarket} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: colors[supermarket] || '#6366f1' }}
                ></div>
                <h5 className="font-medium text-gray-900 capitalize">{supermarket}</h5>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Price Range:</span>
                  <span className="font-medium">Rs {minPrice} - Rs {maxPrice}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Change:</span>
                  <span className={`font-medium ${priceChange >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {priceChange >= 0 ? '+' : ''}Rs {priceChange.toFixed(2)} ({changePercent.toFixed(1)}%)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Data Points:</span>
                  <span className="font-medium">{prices.length}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PriceHistoryChart;
