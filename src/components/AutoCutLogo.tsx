export const AutoCutLogo = ({ className = "w-6 h-6", color = "white", cutColor = "black" }: { className?: string, color?: string, cutColor?: string }) => (
  <svg 
    className={className} 
    viewBox="0 0 100 100" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="100" height="100" rx="20" fill="black" />
    {/* Base Triangle (Play Button) */}
    <path d="M30 20V80L85 50L30 20Z" fill={color} />
    
    {/* Diagonal Cut Line */}
    <path d="M15 15L85 85" stroke={cutColor} strokeWidth="8" strokeLinecap="round" />
  </svg>
);
