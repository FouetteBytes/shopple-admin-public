import { create } from "zustand"

type pageOptions = 'DASHBOARD' | 'CLASSIFIER' | 'CACHE' | 'CRAWLER' | 'SETTINGS' | 'ANALYTICS' | 'HISTORY' | 'SUPPORT'

type LogType = 'info' | 'success' | 'error' | 'warning' | 'model' | 'product' | 'ai' | 'think' | 'think-header' | 'think-content' | 'response-header' | 'response' | 'detail' | 'complete' | 'stats' | 'separator'

interface ProcessingLog {
  id: string;
  message: string;
  type: LogType;
  timestamp: string;
}

interface ClassificationSession {
  id: string;
  timestamp: string;
  productsCount: number;
  successCount: number;
  failureCount: number;
  duration: string;
  modelUsed: string;
  source: 'upload' | 'crawler';
  products: Product[];
}

export interface Product {
  id?: string;
  name: string;
  description?: string;
  image_url?: string;
  product_type?: string;
  product_name?: string;
  original_name?: string;
  category?: string;
  brand_name?: string;
  size?: string | number;
  sizeUnit?: string;
  sizeRaw?: string;
  variety?: string;
  price?: string;
  confidence?: number;
  model_used?: string;
  processing_time?: number;
  error?: string;
  status?: string;
}

interface ProcessingStats {
  totalTime: string;
  avgTime: string;
  successful: number;
  failed: number;
}

export interface ModelStats {
  groq: number;
  cerebras: number;
  gemini: number;
  openrouter: number;
  switches: number;
}

interface CacheStatus {
  size: number;
  hitRate: number;
  storageUsed: string;
}

interface CrawlerStatus {
  activeCrawlers: number;
  productsScraped: number;
  successRate: number;
  lastRun?: string;
}

interface centralStore {
  // Page navigation
  activePage: pageOptions
  setActivePage: (page: pageOptions) => void

  // Sidebar state
  isSidebarOpen: boolean
  toggleSidebar: () => void
  setIsSidebarOpen: (isOpen: boolean) => void

  // Product data
  inputData: Product[]
  setInputData: (data: Product[]) => void
  outputData: Product[]
  setOutputData: (data: Product[]) => void

  // Processing state
  isProcessing: boolean
  setIsProcessing: (processing: boolean) => void
  progress: number
  setProgress: (progress: number) => void
  currentProduct: string
  setCurrentProduct: (product: string) => void
  currentProductIndex: number | null
  setCurrentProductIndex: (index: number | null) => void
  currentStep: string
  setCurrentStep: (step: string) => void
  processingStartTime: number | null
  setProcessingStartTime: (timestamp: number | null) => void

  // Processing logs and stats
  processingLogs: ProcessingLog[]
  setProcessingLogs: (logs: ProcessingLog[]) => void
  addProcessingLog: (message: string, type?: LogType) => void
  processingStats: ProcessingStats
  setProcessingStats: (stats: ProcessingStats) => void
  modelStats: ModelStats
  setModelStats: (stats: ModelStats) => void
  updateModelStats: (updater: (prev: ModelStats) => ModelStats) => void

  // API status
  apiStatus: 'checking' | 'online' | 'offline'
  setApiStatus: (status: 'checking' | 'online' | 'offline') => void

  // Cache settings
  useCacheForLookup: boolean
  setUseCacheForLookup: (use: boolean) => void
  storeCacheAfterClassification: boolean
  setStoreCacheAfterClassification: (store: boolean) => void
  cacheStatus: CacheStatus
  setCacheStatus: (status: CacheStatus) => void

  // Crawler status
  crawlerStatus: CrawlerStatus
  setCrawlerStatus: (status: CrawlerStatus) => void

  // Classification history
  classificationHistory: ClassificationSession[]
  setClassificationHistory: (history: ClassificationSession[]) => void
  addClassificationSession: (session: ClassificationSession) => void
  startClassificationSession: () => void
  completeClassificationSession: () => void

  // UI state
  currentModel: string
  setCurrentModel: (model: string) => void
  modelSwitching: boolean
  setModelSwitching: (switching: boolean) => void
  modelProgress: { step: string; progress: number }
  setModelProgress: (progress: { step: string; progress: number }) => void
  editMode: boolean
  setEditMode: (edit: boolean) => void

  // View management
  currentView: 'upload' | 'input' | 'processing' | 'output'
  setCurrentView: (view: 'upload' | 'input' | 'processing' | 'output') => void

  // Auto-scroll behavior for logs
  autoScroll: boolean
  setAutoScroll: (auto: boolean) => void

  // Available product types for dropdowns
  availableProductTypes: string[]
  setAvailableProductTypes: (types: string[]) => void

  // Utility functions
  resetApp: () => void
  updateInputData: (index: number, field: string, value: any) => void
  updateOutputData: (index: number, field: string, value: any) => void
  addInputRow: () => void
  removeInputRow: (index: number) => void
}

export const useCentralStore = create<centralStore>((set, get) => ({
  // Page navigation
  activePage: 'DASHBOARD',
  setActivePage: (page) => set({ activePage: page }),

  // Sidebar state
  isSidebarOpen: false,
  toggleSidebar: () => set({ isSidebarOpen: !get().isSidebarOpen }),
  setIsSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),

  // Product data
  inputData: [],
  setInputData: (data) => set({ inputData: data }),
  outputData: [],
  setOutputData: (data) => set({ outputData: data }),

  // Processing state
  isProcessing: false,
  setIsProcessing: (processing) => set({ isProcessing: processing }),
  progress: 0,
  setProgress: (progress) => set({ progress }),
  currentProduct: '',
  setCurrentProduct: (product) => set({ currentProduct: product }),
  currentProductIndex: null,
  setCurrentProductIndex: (index) => set({ currentProductIndex: index }),
  currentStep: '',
  setCurrentStep: (step) => set({ currentStep: step }),
  processingStartTime: null,
  setProcessingStartTime: (timestamp) => set({ processingStartTime: timestamp }),

  // Processing logs and stats
  processingLogs: [],
  setProcessingLogs: (logs) => set({ processingLogs: logs }),
  addProcessingLog: (message, type = 'info') => {
    const newLog: ProcessingLog = { 
      id: Date.now() + Math.random().toString(),
      message, 
      type, 
      timestamp: new Date().toLocaleTimeString()
    };
    set((state) => ({ 
      processingLogs: [...state.processingLogs, newLog] 
    }));
  },
  processingStats: {
    totalTime: '0s',
    avgTime: '0s',
    successful: 0,
    failed: 0
  },
  setProcessingStats: (stats) => set({ processingStats: stats }),
  modelStats: {
    groq: 0,
    cerebras: 0,
    gemini: 0,
    openrouter: 0,
    switches: 0
  },
  setModelStats: (stats) => set({ modelStats: stats }),
  updateModelStats: (updater: (prev: ModelStats) => ModelStats) => set((state) => ({ 
    modelStats: updater(state.modelStats) 
  })),

  // API status
  apiStatus: 'checking',
  setApiStatus: (status) => set({ apiStatus: status }),

  // Cache settings
  useCacheForLookup: true,
  setUseCacheForLookup: (use) => set({ useCacheForLookup: use }),
  storeCacheAfterClassification: true,
  setStoreCacheAfterClassification: (store) => set({ storeCacheAfterClassification: store }),
  cacheStatus: {
    size: 0,
    hitRate: 0,
    storageUsed: '0 MB'
  },
  setCacheStatus: (status) => set({ cacheStatus: status }),

  // Crawler status
  crawlerStatus: {
    activeCrawlers: 0,
    productsScraped: 0,
    successRate: 100
  },
  setCrawlerStatus: (status) => set({ crawlerStatus: status }),

  // Classification history
  classificationHistory: [],
  setClassificationHistory: (history) => set({ classificationHistory: history }),
  addClassificationSession: (session) => {
    set((state) => ({ 
      classificationHistory: [...state.classificationHistory, session].slice(-50) // Keep only last 50 sessions
    }));
    // Also save to localStorage for persistence
    const updatedHistory = [...get().classificationHistory, session].slice(-50);
    if (typeof window !== 'undefined') {
      localStorage.setItem('classificationHistory', JSON.stringify(updatedHistory));
    }
  },

  // Start classification session tracking
  startClassificationSession: () => {
    const state = get();
    if (typeof window !== 'undefined') {
      localStorage.setItem('classificationStartTime', Date.now().toString());
      localStorage.setItem('classificationStartProducts', JSON.stringify(state.inputData));
    }
  },

  // Complete classification session tracking
  completeClassificationSession: () => {
    const state = get();
    if (typeof window !== 'undefined') {
      const startTime = localStorage.getItem('classificationStartTime');
      const startProducts = localStorage.getItem('classificationStartProducts');
      const source = localStorage.getItem('classificationSource') || 'upload';
      const crawlerInfo = localStorage.getItem('classificationCrawlerInfo');
      
      if (startTime && startProducts) {
        try {
          const duration = Math.round((Date.now() - parseInt(startTime)) / 1000);
          const products = JSON.parse(startProducts);
          
          const successCount = state.outputData.filter(p => 
            p.product_type && p.product_type !== 'AI_FAILED' && !p.error
          ).length;
          
          const failureCount = state.outputData.length - successCount;
          
          // Determine most used model
          const modelCounts: Record<string, number> = {};
          state.outputData.forEach(p => {
            if (p.model_used) {
              modelCounts[p.model_used] = (modelCounts[p.model_used] || 0) + 1;
            }
          });
          
          const mostUsedModel = Object.keys(modelCounts).length > 0 
            ? Object.keys(modelCounts).reduce((a, b) => 
                modelCounts[a] > modelCounts[b] ? a : b
              ) 
            : 'Mixed';
          
          const session: ClassificationSession = {
            id: Date.now().toString(),
            timestamp: new Date(parseInt(startTime)).toISOString(),
            productsCount: products.length,
            successCount,
            failureCount,
            duration: `${Math.floor(duration / 60)}m ${duration % 60}s`,
            modelUsed: mostUsedModel,
            source: source as 'upload' | 'crawler',
            products: state.outputData
          };
          
          get().addClassificationSession(session);
          
          // Clean up
          localStorage.removeItem('classificationStartTime');
          localStorage.removeItem('classificationStartProducts');
          localStorage.removeItem('classificationSource');
          localStorage.removeItem('classificationCrawlerInfo');
        } catch (error) {
          console.error('Failed to save classification session:', error);
        }
      }
    }
  },

  // UI state
  currentModel: '',
  setCurrentModel: (model) => set({ currentModel: model }),
  modelSwitching: false,
  setModelSwitching: (switching) => set({ modelSwitching: switching }),
  modelProgress: { step: '', progress: 0 },
  setModelProgress: (progress) => set({ modelProgress: progress }),
  editMode: false,
  setEditMode: (edit) => set({ editMode: edit }),

  // View management
  currentView: 'upload',
  setCurrentView: (view) => set({ currentView: view }),

  // Auto-scroll behavior for logs
  autoScroll: true,
  setAutoScroll: (auto) => set({ autoScroll: auto }),

  // Available product types for dropdowns
  availableProductTypes: [
    'Rice', 'Lentil', 'Spice', 'Oil', 'Sugar', 'Flour', 'Eggs', 'Milk Product', 
    'Dairy', 'Biscuit', 'Noodles', 'Snack Bar', 'Cereal', 'Candy', 'Fish', 
    'Dry Fish', 'Meat', 'Vegetable', 'Fruit', 'Beverage', 'Seasoning', 'Other'
  ],
  setAvailableProductTypes: (types) => set({ availableProductTypes: types }),

  // Utility functions
  resetApp: () => set({
    inputData: [],
    outputData: [],
    isProcessing: false,
    progress: 0,
    currentProduct: '',
  currentProductIndex: null,
    currentStep: '',
  processingStartTime: null,
    currentView: 'upload',
    processingLogs: [],
    modelStats: { groq: 0, cerebras: 0, gemini: 0, openrouter: 0, switches: 0 },
    processingStats: { totalTime: '0s', avgTime: '0s', successful: 0, failed: 0 },
    autoScroll: true,
    editMode: false,
    currentModel: '',
    modelSwitching: false,
    modelProgress: { step: '', progress: 0 }
  }),

  updateInputData: (index, field, value) => {
    const state = get();
    const updatedData = [...state.inputData];
    updatedData[index] = { ...updatedData[index], [field]: value };
    set({ inputData: updatedData });
  },

  updateOutputData: (index, field, value) => {
    const state = get();
    const updatedData = [...state.outputData];
    updatedData[index] = { ...updatedData[index], [field]: value };
    set({ outputData: updatedData });
  },

  addInputRow: () => {
    const state = get();
    const newProduct: Product = { 
      name: 'New Product',
      description: '',
      product_type: ''
    };
    set({ inputData: [...state.inputData, newProduct] });
  },

  removeInputRow: (index) => {
    const state = get();
    const updatedData = state.inputData.filter((_, i) => i !== index);
    set({ inputData: updatedData });
  }
}))