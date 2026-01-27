import React from 'react';
import SimplePriceChart from './SimplePriceChart';

interface MaterialPriceChartProps {
  products: any[];
  title?: string;
}

const MaterialPriceChart: React.FC<MaterialPriceChartProps> = ({ products, title }) => {
  return <SimplePriceChart products={products} title={title} />;
};

export default MaterialPriceChart;
