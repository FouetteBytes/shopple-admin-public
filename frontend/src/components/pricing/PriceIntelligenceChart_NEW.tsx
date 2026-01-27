import React from 'react';
import MaterialPriceChart from '@/components/charts/MaterialPriceChart';

interface PriceIntelligenceChartProps {
  priceHistory: any;
  currentPrices: any[];
  productName: string;
  className?: string;
}

const PriceIntelligenceChart: React.FC<PriceIntelligenceChartProps> = ({ 
  priceHistory, 
  currentPrices,
  productName, 
  className = '' 
}) => {
  // Convert the data to the format expected by MaterialPriceChart
  const products = React.useMemo(() => {
    const productArray = [];
    
    // Add historical data
    if (priceHistory && typeof priceHistory === 'object') {
      if (Array.isArray(priceHistory)) {
        productArray.push(...priceHistory);
      } else {
        // Convert object format to array
        Object.entries(priceHistory).forEach(([date, price]) => {
          productArray.push({
            name: productName,
            price: Number(price),
            date: date,
            timestamp: new Date(date).getTime()
          });
        });
      }
    }
    
    // Add current prices if available
    if (currentPrices && Array.isArray(currentPrices)) {
      const today = new Date().toISOString().split('T')[0];
      currentPrices.forEach(item => {
        productArray.push({
          name: productName,
          price: Number(item.price || item.current_price || 0),
          date: today,
          store: item.supermarket || item.store || 'Unknown',
          timestamp: Date.now()
        });
      });
    }
    
    return productArray;
  }, [priceHistory, currentPrices, productName]);

  return (
    <div className={className}>
      <MaterialPriceChart 
        products={products} 
        title={`Interactive Price Intelligence - ${productName}`}
      />
    </div>
  );
};

export default PriceIntelligenceChart;
