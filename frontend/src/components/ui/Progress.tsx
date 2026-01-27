interface ProgressProps {
  value: number
  className?: string
}

export const Progress = ({ value, className = '' }: ProgressProps) => {
  return (
    <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${className}`}>
      <div 
        className="bg-blue-600 h-full transition-all duration-300 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
