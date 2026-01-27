import React from 'react';

interface DebugDataProps {
  data: any;
  title: string;
}

const DebugData: React.FC<DebugDataProps> = ({ data, title }) => {
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
      <h4 className="font-semibold text-yellow-800 mb-2">{title} - Debug Info</h4>
      <pre className="text-xs bg-white p-2 rounded border overflow-auto max-h-48">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
};

export default DebugData;
