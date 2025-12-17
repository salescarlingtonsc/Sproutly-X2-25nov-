
import React, { useCallback, useState } from 'react';

interface FileUploaderProps {
  onUpload: (files: File[]) => Promise<void>;
  accept?: string;
  multiple?: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onUpload, accept = "*", multiple = true }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(Array.from(e.target.files));
    }
  };

  const processFiles = async (files: File[]) => {
    setIsUploading(true);
    try {
      await onUpload(files);
    } catch (err) {
      console.error(err);
      alert("Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={`
        relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer group
        ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}
      `}
    >
      <input 
        type="file" 
        multiple={multiple} 
        accept={accept} 
        onChange={handleChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isUploading}
      />
      
      {isUploading ? (
        <div className="flex flex-col items-center justify-center text-indigo-600">
           <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-2"></div>
           <span className="text-xs font-bold">Uploading to Secure Vault...</span>
        </div>
      ) : (
        <>
          <div className="text-4xl mb-2 group-hover:scale-110 transition-transform text-gray-300 group-hover:text-indigo-400">📂</div>
          <p className="text-sm font-bold text-gray-600">
            Drag & drop files here, or <span className="text-indigo-600">browse</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Supports PDF, JPG, PNG, DOCX (Max 10MB)
          </p>
        </>
      )}
    </div>
  );
};

export default FileUploader;
