import React from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface MiniPriceTrendProps {
  data: Array<{date: string, price: number}>;
  color?: string;
  height?: number;
  className?: string;
}

const MiniPriceTrend: React.FC<MiniPriceTrendProps> = ({ 
  data, 
  color = '#3b82f6', 
  height = 60,
  className = '' 
}) => {
  if (!data || data.length === 0) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ height }}>
        <span className="text-xs text-gray-400">No data</span>
      </div>
    );
  }

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line 
            type="monotone" 
            dataKey="price" 
            stroke={color} 
            strokeWidth={2}
            dot={false}
            activeDot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MiniPriceTrend;
