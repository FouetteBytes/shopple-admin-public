import React from 'react';
import MaterialPriceChart from '@/components/charts/MaterialPriceChart';
import { Chart, InfoCircle, Chart1 } from 'iconsax-react';

const ChartDiagnostics: React.FC = () => {
  // Generate sample data for testing
  const sampleProducts = React.useMemo(() => {
    const products: any[] = [];
    const startDate = new Date('2024-01-01');
    const stores = ['Keells', 'Cargills'];
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      
      stores.forEach(store => {
        products.push({
          name: `Sample Product`,
          price: 100 + Math.random() * 50 + Math.sin(i * 0.1) * 20,
          date: date.toISOString().split('T')[0],
          store: store,
          timestamp: date.getTime()
        });
      });
    }
    
    return products;
  }, []);

  return (
    <div className="p-6">
      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-4 flex items-center gap-2">
          <Chart1 size={24} className="text-indigo-600" variant="Bulk" />
          <h1 className="text-xl font-bold text-slate-900">
            Chart Diagnostics Dashboard
          </h1>
        </div>
        
        <div className="mb-4 rounded-lg bg-blue-50 p-4 text-blue-900">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <InfoCircle size={18} variant="Bold" />
            Purpose & Functionality
          </div>
          <p className="text-sm text-blue-700">
            <strong>Chart Diagnostics</strong> is a testing component designed to verify chart functionality 
            and troubleshoot rendering issues. It displays sample data using our charts 
            to ensure the charting system works correctly before applying real product data.
          </p>
        </div>

        <div className="mt-4 text-sm text-slate-500 flex items-center gap-2">
          <Chart size={16} className="text-slate-400" />
          Testing with {sampleProducts.length} sample data points across multiple stores and dates
        </div>
      </div>

      <MaterialPriceChart 
        products={sampleProducts} 
        title="Chart Functionality Test - Sample Data"
      />
    </div>
  );
};

export default ChartDiagnostics;
