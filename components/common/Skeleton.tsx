
import React from 'react';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
}

const Skeleton: React.FC<SkeletonProps> = ({ className, width, height }) => {
  return (
    <div 
      className={`bg-gray-200/80 animate-pulse rounded-md ${className || ''}`} 
      style={{ width, height }}
    ></div>
  );
};

export default Skeleton;
