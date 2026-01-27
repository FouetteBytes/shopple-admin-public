'use client';

import React, { useEffect, useState } from 'react';
import { 
  CheckCircle, 
  AlertTriangle, 
  Search, 
  Loader, 
  TrendingUp,
  Zap,
  Target,
  Database,
  X
} from 'lucide-react';

interface DetectionLog {
  productName: string;
  brand: string;
  size: string;
  matchType: 'PERFECT' | 'EXACT' | 'FUZZY' | 'NORMALIZED' | 'NONE';
  matchCount: number;
  topMatch?: {
    name: string;
    brand: string;
    size: string;
    score: number;
  };
  matchReason?: string;
  isDuplicate: boolean;
  timestamp: number;
  tier?: 1 | 2 | 3;
}

interface ProgressStats {
  total: number;
  processed: number;
  duplicates: number;
  newProducts: number;
  tier1Matches: number; // Perfect matches
  tier2Matches: number; // Near exact
  tier3Matches: number; // Fuzzy/normalized
}

interface DuplicateDetectionProgressProps {
  isOpen: boolean;
  onClose: () => void;
  totalProducts: number;
  currentProgress?: ProgressStats;
  onComplete?: (stats: ProgressStats) => void;
  allowDismiss?: boolean;
  logs?: string[]; // Simple log messages
}


const DuplicateDetectionProgress: React.FC<DuplicateDetectionProgressProps> = ({
  isOpen,
  onClose,
  totalProducts,
  currentProgress,
  onComplete,
  allowDismiss = false,
  logs: logMessages = []
}) => {
  const [logs, setLogs] = useState<DetectionLog[]>([]);
  const [displayLogs, setDisplayLogs] = useState<string[]>([]);
  const [stats, setStats] = useState<ProgressStats>({
    total: totalProducts,
    processed: 0,
    duplicates: 0,
    newProducts: 0,
    tier1Matches: 0,
    tier2Matches: 0,
    tier3Matches: 0
  });
  const [isComplete, setIsComplete] = useState(false);

  // Update display logs from parent
  useEffect(() => {
    if (logMessages && logMessages.length > 0) {
      setDisplayLogs(logMessages);
    }
  }, [logMessages]);

  // Update stats from parent
  useEffect(() => {
    if (currentProgress) {
      setStats(currentProgress);
      if (currentProgress.total > 0 && currentProgress.processed >= currentProgress.total) {
        setIsComplete(true);
      }
    }
  }, [currentProgress]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setLogs([]);
      setDisplayLogs([]);
      setIsComplete(false);
    }
  }, [isOpen]);

  const progress = stats.total > 0 ? (stats.processed / stats.total) * 100 : 0;
  // Ensure progress doesn't exceed 100% visually
  const displayProgress = Math.min(progress, 100);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all duration-300">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100 bg-white">
          <div className="flex items-center space-x-5">
            <div className={`p-3 rounded-lg ${isComplete ? 'bg-green-100' : 'bg-primary/10'}`}>
              {isComplete ? (
                <CheckCircle className="h-6 w-6 text-green-600" />
              ) : (
                <Database className="h-6 w-6 text-primary animate-pulse" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {isComplete ? 'Analysis Complete' : 'Analyzing Products'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {isComplete 
                  ? 'Preparing your review dashboard...' 
                  : `Intelligent matching in progress for ${stats.total} items`}
              </p>
            </div>
          </div>
          {allowDismiss && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Main Content */}
        <div className="p-8 space-y-8 bg-gray-50/50 flex-1 overflow-y-auto">
          
          {/* Progress Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm font-medium">
              <div className="flex items-center space-x-2">
                {isComplete ? (
                   <span className="flex items-center text-green-600">
                      <Loader className="h-4 w-4 mr-2 animate-spin" />
                      Finalizing results...
                   </span>
                ) : (
                  <span className="text-gray-700">
                    Processing {stats.processed} of {stats.total}
                  </span>
                )}
              </div>
              <span className={`text-lg font-bold ${isComplete ? 'text-green-600' : 'text-primary'}`}>
                {displayProgress.toFixed(0)}%
              </span>
            </div>
            
            <div className="h-3 w-full bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ease-out rounded-full relative overflow-hidden ${
                  isComplete ? 'bg-green-500' : 'bg-primary'
                }`}
                style={{ width: `${displayProgress}%` }}
              >
                <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]" />
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {/* New Products */}
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">New</span>
                <div className="p-1.5 bg-green-50 rounded-md">
                   <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-gray-900">{stats.newProducts}</div>
              <p className="text-xs text-green-600 mt-1">To be created</p>
            </div>

            {/* Duplicates */}
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Duplicates</span>
                 <div className="p-1.5 bg-orange-50 rounded-md">
                   <AlertTriangle className="h-4 w-4 text-orange-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-gray-900">{stats.duplicates}</div>
              <p className="text-xs text-orange-600 mt-1">Require review</p>
            </div>

            {/* Tier 1 */}
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm opacity-75">
               <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Exact</span>
                 <div className="p-1.5 bg-gray-50 rounded-md">
                   <Target className="h-4 w-4 text-red-500" />
                </div>
              </div>
              <div className="text-2xl font-bold text-gray-900">{stats.tier1Matches}</div>
              <p className="text-xs text-gray-500 mt-1">100% Match</p>
            </div>

             {/* Tier 2 */}
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm opacity-75">
               <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Near</span>
                 <div className="p-1.5 bg-gray-50 rounded-md">
                   <TrendingUp className="h-4 w-4 text-orange-500" />
                </div>
              </div>
              <div className="text-2xl font-bold text-gray-900">{stats.tier2Matches}</div>
              <p className="text-xs text-gray-500 mt-1">High confidence</p>
            </div>

             {/* Tier 3 */}
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm opacity-75">
               <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Fuzzy</span>
                 <div className="p-1.5 bg-gray-50 rounded-md">
                   <Zap className="h-4 w-4 text-blue-500" />
                </div>
              </div>
              <div className="text-2xl font-bold text-gray-900">{stats.tier3Matches}</div>
              <p className="text-xs text-gray-500 mt-1">AI detected</p>
            </div>
          </div>

          {/* Live Logs */}
          <div className="bg-gray-900 rounded-xl overflow-hidden shadow-inner border border-gray-800 flex flex-col h-64">
            <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 flex justify-between items-center">
              <span className="text-xs font-mono text-gray-400 uppercase tracking-wider flex items-center">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-2"></span>
                Live Detection Stream
              </span>
              <span className="text-xs text-gray-500">{displayLogs.length} events</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs custom-scrollbar">
              {displayLogs.length === 0 ? (
                 <div className="h-full flex items-center justify-center text-gray-600 italic">
                   Waiting for stream connection...
                 </div>
              ) : (
                displayLogs.slice().reverse().map((log, i) => (
                  <div key={i} className="flex space-x-2 text-gray-300 border-l-2 border-transparent pl-2 hover:border-primary transition-colors">
                    <span className="text-gray-600 select-none">[{new Date().toLocaleTimeString().split(' ')[0]}]</span>
                    <span className={log.includes('✅') ? 'text-green-400 font-bold' : ''}>
                      {log}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

};

export default DuplicateDetectionProgress;
