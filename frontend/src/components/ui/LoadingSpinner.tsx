interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'gray' | 'white';
  className?: string;
}

export const LoadingSpinner = ({ 
  size = 'md', 
  color = 'primary', 
  className = '' 
}: LoadingSpinnerProps) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6', 
    lg: 'h-8 w-8'
  };

  const getBorderColor = (color: string) => {
    switch (color) {
      case 'primary':
        return 'border-t-primary';
      case 'gray':
        return 'border-t-gray-600';
      case 'white':
        return 'border-t-white';
      default:
        return 'border-t-primary';
    }
  };

  return (
    <div 
      className={`
        animate-spin rounded-full border-2 border-gray-200 
        ${sizeClasses[size]} 
        ${getBorderColor(color)}
        ${className}
      `}
    />
  );
};

interface LoadingOverlayProps {
  message?: string;
  isVisible: boolean;
}

export const LoadingOverlay = ({ 
  message = 'Loading...', 
  isVisible 
}: LoadingOverlayProps) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200">
        <div className="flex items-center space-x-3">
          <LoadingSpinner size="md" color="primary" />
          <span className="text-gray-700 font-medium">{message}</span>
        </div>
      </div>
    </div>
  );
};

export default LoadingSpinner;
