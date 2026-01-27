import React, { useState, useEffect } from 'react';
import { keysAPI } from '@/lib/api';

interface AuditLog {
  id: string;
  audit_timestamp: string;
  audit_user_email: string;
  audit_user_id?: string;
  audit_action: string;
  audit_resource: string;
  audit_status?: string;
  audit_notes?: any;
  audit_risk_level?: string;
  audit_source?: string;
}

interface AuditLogViewerProps {
  initialLogs?: AuditLog[];
}

const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ initialLogs = [] }) => {
  const [logs, setLogs] = useState<AuditLog[]>(initialLogs);
  const [loading, setLoading] = useState(false);
  const [selectedLogs, setSelectedLogs] = useState<Set<string>>(new Set());
  const [totalLogs, setTotalLogs] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExplanation, setAiExplanation] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('groq');
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState<Record<string, string[]>>({});
  
  const [filters, setFilters] = useState({
    userEmail: '',
    action: '',
    resource: '',
    riskLevel: '',
    source: '',
    startDate: '',
    endDate: '',
    search: ''
  });

  // Fetch available AI models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const models = await keysAPI.allowedModels();
        setAvailableModels(models);
        // Set default model for default provider
        if (models.groq && models.groq.length > 0) {
          setSelectedModel(models.groq[0]);
        }
      } catch (error) {
        console.error('Failed to fetch models:', error);
      }
    };
    fetchModels();
  }, []);

  // Update selected model when provider changes
  useEffect(() => {
    const models = availableModels[selectedProvider] || [];
    if (models.length > 0) {
      setSelectedModel(models[0]);
    }
  }, [selectedProvider, availableModels]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * limit;
      
      // Build query params for GET request
      const params = new URLSearchParams();
      if (filters.userEmail) params.append('user_email', filters.userEmail);
      if (filters.action) params.append('action', filters.action);
      if (filters.startDate) params.append('start_date', filters.startDate);
      if (filters.endDate) params.append('end_date', filters.endDate);
      if (filters.search) params.append('search', filters.search);
      params.append('limit', limit.toString());
      params.append('page', page.toString());
      
      const response = await fetch(`/api/audit/list?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }

      const data = await response.json();
      setLogs(data.logs || []);
      setTotalLogs(data.total || 0);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchLogs();
  };

  const handleRefresh = () => {
    setSelectedLogs(new Set());
    fetchLogs();
  };

  const toggleLogSelection = (logId: string) => {
    const newSelected = new Set(selectedLogs);
    if (newSelected.has(logId)) {
      newSelected.delete(logId);
    } else {
      newSelected.add(logId);
    }
    setSelectedLogs(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedLogs.size === logs.length) {
      setSelectedLogs(new Set());
    } else {
      setSelectedLogs(new Set(logs.map(log => log.id)));
    }
  };

  const handleExplainWithAI = async () => {
    if (selectedLogs.size === 0) return;
    
    setShowAIDialog(true);
    setAiLoading(true);
    setAiExplanation('');

    try {
      const selectedLogData = logs.filter(log => selectedLogs.has(log.id));
      
      const prompt = `As a security analyst, please analyze the following audit log entries and provide insights:

${selectedLogData.map((log, idx) => `
Entry ${idx + 1}:
- Timestamp: ${log.audit_timestamp}
- User: ${log.audit_user_email || 'system'}
- Action: ${log.audit_action}
- Resource: ${log.audit_resource}
- Status: ${log.audit_status || 'N/A'}
- Risk Level: ${log.audit_risk_level || 'N/A'}
- Details: ${JSON.stringify(log.audit_notes, null, 2)}
`).join('\n')}

Please provide:
1. Summary of what happened
2. Any security concerns or anomalies
3. Recommendations if applicable`;

      const response = await fetch('/api/ai/prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          prompt,
          provider: selectedProvider,
          model: selectedModel,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get AI explanation');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let explanation = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  explanation += parsed.content;
                  setAiExplanation(explanation);
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error getting AI explanation:', error);
      setAiExplanation('Failed to get AI explanation. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const triggerRetention = async () => {
    if (!confirm('Are you sure you want to run the retention policy? This will delete old logs based on the configuration.')) {
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('/api/audit/retention', { 
        method: 'POST',
        credentials: 'include'
      });
      const result = await response.json();
      if (response.ok) {
        alert(result.message || 'Retention policy enforced via OpenSearch.');
        handleRefresh();
      } else {
        alert('Failed to run retention: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, limit]);

  const getRiskBadgeColor = (risk?: string) => {
    switch (risk?.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes('DELETE') || action.includes('REMOVE')) {
      return 'bg-red-100 text-red-800';
    } else if (action.includes('UPDATE') || action.includes('EDIT') || action.includes('MODIFY')) {
      return 'bg-yellow-100 text-yellow-800';
    } else if (action.includes('CREATE') || action.includes('ADD')) {
      return 'bg-green-100 text-green-800';
    } else if (action.includes('LOGIN') || action.includes('AUTH')) {
      return 'bg-blue-100 text-blue-800';
    } else if (action.includes('FAIL') || action.includes('ERROR')) {
      return 'bg-red-100 text-red-800';
    }
    return 'bg-gray-100 text-gray-800';
  };

  const formatDetails = (details: any) => {
    if (!details) return null;
    
    if (typeof details === 'string') {
      try {
        details = JSON.parse(details);
      } catch {
        return details;
      }
    }

    if (typeof details === 'object') {
      return (
        <div className="space-y-1">
          {Object.entries(details).map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="font-medium text-gray-700">{key}:</span>
              <span className="text-gray-600">
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </span>
            </div>
          ))}
        </div>
      );
    }

    return String(details);
  };

  const totalPages = Math.ceil(totalLogs / limit);

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Audit Trail</h2>
          <p className="text-sm text-gray-600 mt-1">
            Showing {logs.length} of {totalLogs} logs
            {selectedLogs.size > 0 && <span className="ml-2 text-blue-600">({selectedLogs.size} selected)</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {selectedLogs.size > 0 && (
            <button 
              onClick={handleExplainWithAI}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Explain with AI
            </button>
          )}
          <button 
            onClick={triggerRetention}
            className="px-4 py-2 bg-red-100 text-red-700 border border-red-200 rounded hover:bg-red-200 transition text-sm"
            title="Deletes logs older than retention period"
          >
            Cleanup Old Logs
          </button>
          <button 
            onClick={handleRefresh}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Enhanced Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 bg-gray-50 p-4 rounded">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">User Email</label>
          <input
            type="text"
            className="w-full px-3 py-2 border rounded focus:ring-blue-500 focus:border-blue-500"
            placeholder="user@example.com"
            value={filters.userEmail}
            onChange={(e) => setFilters({...filters, userEmail: e.target.value})}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
          <select
            className="w-full px-3 py-2 border rounded focus:ring-blue-500 focus:border-blue-500"
            value={filters.action}
            onChange={(e) => setFilters({...filters, action: e.target.value})}
          >
            <option value="">All Actions</option>
            <option value="LOGIN">Login</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
            <option value="CLASSIFY">Classify</option>
            <option value="API_CALL">API Call</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Resource</label>
          <input
            type="text"
            className="w-full px-3 py-2 border rounded focus:ring-blue-500 focus:border-blue-500"
            placeholder="products, users..."
            value={filters.resource}
            onChange={(e) => setFilters({...filters, resource: e.target.value})}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Risk Level</label>
          <select
            className="w-full px-3 py-2 border rounded focus:ring-blue-500 focus:border-blue-500"
            value={filters.riskLevel}
            onChange={(e) => setFilters({...filters, riskLevel: e.target.value})}
          >
            <option value="">All Levels</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date & Time</label>
          <input
            type="datetime-local"
            className="w-full px-3 py-2 border rounded focus:ring-blue-500 focus:border-blue-500"
            value={filters.startDate}
            onChange={(e) => setFilters({...filters, startDate: e.target.value})}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End Date & Time</label>
          <input
            type="datetime-local"
            className="w-full px-3 py-2 border rounded focus:ring-blue-500 focus:border-blue-500"
            value={filters.endDate}
            onChange={(e) => setFilters({...filters, endDate: e.target.value})}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Search Keywords</label>
          <input
            type="text"
            className="w-full px-3 py-2 border rounded focus:ring-blue-500 focus:border-blue-500"
            placeholder="Search in details, notes..."
            value={filters.search}
            onChange={(e) => setFilters({...filters, search: e.target.value})}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <div className="md:col-span-4 flex justify-between items-center">
          <div className="flex gap-2 items-center">
            <label className="text-sm font-medium text-gray-700">Records per page:</label>
            <select
              className="px-3 py-2 border rounded focus:ring-blue-500 focus:border-blue-500"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
          <button 
            onClick={handleSearch}
            className="px-6 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition"
          >
            Apply Filters
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={logs.length > 0 && selectedLogs.size === logs.length}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resource</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Risk</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  <div className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Loading logs...
                  </div>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">No audit records found</td>
              </tr>
            ) : (
              logs.map((log) => {
                const logId = log.id || `${log.audit_timestamp}-${log.audit_action}`;
                const isSelected = selectedLogs.has(logId);
                
                return (
                  <tr 
                    key={logId}
                    className={isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}
                  >
                    <td className="px-3 py-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleLogSelection(logId)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(log.audit_timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="font-medium text-gray-900">
                        {log.audit_user_email || 'system'}
                      </div>
                      {log.audit_user_id && (
                        <div className="text-xs text-gray-500 truncate max-w-[150px]">
                          {log.audit_user_id}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getActionBadgeColor(log.audit_action)}`}>
                        {log.audit_action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.audit_resource}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {log.audit_risk_level && (
                        <span className={`px-2 py-1 inline-flex text-xs font-semibold rounded border ${getRiskBadgeColor(log.audit_risk_level)}`}>
                          {log.audit_risk_level.toUpperCase()}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-md">
                      <details className="cursor-pointer">
                        <summary className="font-medium text-blue-600 hover:text-blue-800">
                          View Details
                        </summary>
                        <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                          {formatDetails(log.audit_notes)}
                          {log.audit_status && (
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <span className="font-medium">Status:</span> {log.audit_status}
                            </div>
                          )}
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
        <div className="text-sm text-gray-700">
          Page {page} of {totalPages || 1} - Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalLogs)} of {totalLogs} records
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Previous
          </button>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-4 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* AI Explanation Dialog */}
      {showAIDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">AI Security Analysis</h3>
                  <p className="text-sm text-gray-600 mt-1">Analyzing {selectedLogs.size} selected log(s)</p>
                </div>
                <button
                  onClick={() => setShowAIDialog(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* Model Selection */}
              <div className="mt-4 flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                  <select
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value)}
                    className="w-full px-3 py-2 border rounded focus:ring-blue-500 focus:border-blue-500"
                    disabled={aiLoading}
                  >
                    {Object.keys(availableModels).map(provider => (
                      <option key={provider} value={provider}>
                        {provider.charAt(0).toUpperCase() + provider.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full px-3 py-2 border rounded focus:ring-blue-500 focus:border-blue-500"
                    disabled={aiLoading}
                  >
                    {(availableModels[selectedProvider] || []).map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                </div>
                {!aiLoading && !aiExplanation && (
                  <div className="flex items-end">
                    <button
                      onClick={handleExplainWithAI}
                      className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition"
                    >
                      Analyze
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {aiLoading ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <svg className="animate-spin h-10 w-10 text-purple-600 mb-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-gray-600">AI is analyzing the logs...</p>
                  {aiExplanation && (
                    <div className="mt-4 w-full max-w-2xl">
                      <div className="prose prose-sm max-w-none bg-gray-50 p-4 rounded">
                        {aiExplanation}
                      </div>
                    </div>
                  )}
                </div>
              ) : aiExplanation ? (
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap bg-gray-50 p-4 rounded text-sm">{aiExplanation}</pre>
                </div>
              ) : (
                <div className="text-center text-gray-500 py-12">
                  Select a provider and model, then click "Analyze" to get AI insights
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              {aiExplanation && (
                <button
                  onClick={() => {
                    setAiExplanation('');
                    setAiLoading(false);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Reset
                </button>
              )}
              <button
                onClick={() => setShowAIDialog(false)}
                className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogViewer;
