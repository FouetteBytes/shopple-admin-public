import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface PriceStatsChartProps {
  data: Array<{
    category: string;
    count: number;
    avgPrice: number;
    supermarket?: string;
  }>;
  type: 'category' | 'supermarket' | 'brand' | 'brands';
  chartType?: 'bar' | 'pie';
  className?: string;
}

const PriceStatsChart: React.FC<PriceStatsChartProps> = ({ 
  data, 
  type,
  chartType = 'bar',
  className = '' 
}) => {
  if (!data || data.length === 0) {
    return (
      <div className={`flex items-center justify-center h-64 ${className}`}>
        <span className="text-gray-400">No data available</span>
      </div>
    );
  }

  const colors = {
    category: '#3b82f6',
    supermarket: '#10b981',
    brand: '#6366f1',
    brands: '#f59e0b'
  };

  const barColor = colors[type] || '#3b82f6';
  
  // Pie chart colors
  const pieColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  if (chartType === 'pie') {
    // Custom legend content to avoid auto-generated 'count' item and show brand names only
    const renderLegend = () => (
      <div style={{
        paddingTop: '20px',
        fontSize: '12px',
        lineHeight: '16px',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8
      }}>
        {data.map((d, idx) => (
          <span key={d.category} style={{ display: 'inline-flex', alignItems: 'center', marginRight: 8 }}>
            <span style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              backgroundColor: pieColors[idx % pieColors.length],
              borderRadius: '50%',
              marginRight: 6
            }} />
            <span>{d.category} ({d.count})</span>
          </span>
        ))}
      </div>
    );
    return (
      <div className={`h-80 ${className}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="45%"
              labelLine={false}
              label={(entry: any) => entry.percent ? `${(entry.percent * 100).toFixed(1)}%` : ''}
              outerRadius={80}
              fill="#8884d8"
              dataKey="count"
              nameKey="category"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
              ))}
            </Pie>
            <Tooltip 
              formatter={(value: any, name: any, props: any) => {
                const { payload } = props as any;
                const category = payload?.category ?? name;
                return [`${value} products`, category];
              }}
              labelFormatter={(label) => `${label}`}
            />
            <Legend verticalAlign="bottom" height={80} content={renderLegend} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className={`h-64 ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="category" />
          <YAxis />
          <Tooltip 
            formatter={(value, name) => {
              if (name === 'count') return [`${value} products`, 'Products'];
              if (name === 'avgPrice') return [`Rs ${Number(value).toFixed(2)}`, 'Avg Price'];
              return [value, name];
            }}
          />
          <Bar dataKey="count" fill={barColor} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PriceStatsChart;
