import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface SimplePriceChartProps {
  products: any[];
  title?: string;
}

const SimplePriceChart: React.FC<SimplePriceChartProps> = ({ products, title = "Price History Trends" }) => {
  // Convert products to simple chart data
  const chartData = React.useMemo(() => {
    if (!products || products.length === 0) return [];
    
    return products.map((product, index) => ({
      date: product.date || `Day ${index + 1}`,
      price: Number(product.price) || 0,
      name: product.name || 'Product'
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [products]);

  const formatTooltip = (value: any, name: string) => {
    if (name === 'price') {
      return [`Rs. ${Number(value).toFixed(2)}`, 'Price'];
    }
    return [value, name];
  };

  const formatYAxis = (value: number) => `Rs. ${value.toFixed(0)}`;

  if (chartData.length === 0) {
    return (
      <div style={{ 
        padding: '20px', 
        textAlign: 'center', 
        border: '1px solid #ddd', 
        borderRadius: '8px',
        backgroundColor: '#f9f9f9'
      }}>
        <h3>{title}</h3>
        <p>No data available</p>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '20px', 
      border: '1px solid #ddd', 
      borderRadius: '8px',
      backgroundColor: 'white'
    }}>
      <h3 style={{ marginBottom: '20px', color: '#333' }}>{title}</h3>
      <div style={{ height: '400px', width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="date" 
              stroke="#666"
              fontSize={12}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis 
              tickFormatter={formatYAxis}
              stroke="#666"
              fontSize={12}
            />
            <Tooltip 
              formatter={formatTooltip}
              labelStyle={{ color: '#333' }}
              contentStyle={{ 
                backgroundColor: '#fff', 
                border: '1px solid #ccc',
                borderRadius: '8px'
              }}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="price" 
              stroke="#1976d2" 
              strokeWidth={2}
              dot={{ fill: '#1976d2', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: '#1976d2', strokeWidth: 2 }}
              name="Price"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ 
        marginTop: '10px', 
        fontSize: '12px', 
        color: '#666', 
        textAlign: 'center' 
      }}>
        Showing {chartData.length} data points
      </div>
    </div>
  );
};

export default SimplePriceChart;
