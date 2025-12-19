
import React, { useState, useCallback } from 'react';

interface FileUploaderProps {
  onUpload: (files: File[]) => Promise<void>;
  isUploading?: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onUpload, isUploading }) => {
  const [isOver, setIsOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    if (e.dataTransfer.files) onUpload(Array.from(e.dataTransfer.files));
  }, [onUpload]);

  return (
    <div 
      onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
      onDragLeave={() => setIsOver(false)}
      onDrop={handleDrop}
      className={`
        border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer
        ${isOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'}
      `}
    >
      <input 
        type="file" multiple className="hidden" id="file-input" 
        onChange={(e) => e.target.files && onUpload(Array.from(e.target.files))}
      />
      <label htmlFor="file-input" className="cursor-pointer">
        <div className="text-3xl mb-2">📁</div>
        <div className="text-sm font-bold text-gray-700">
           {isUploading ? 'Uploading...' : 'Drop files here or click to browse'}
        </div>
        <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest font-bold">Maximum 10MB per file</div>
      </label>
    </div>
  );
};

export default FileUploader;
