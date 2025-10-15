// app/components/studio/FileExplorer.tsx
import React from 'react';

interface FileExplorerProps {
  fileCache: Record<string, string>;
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
  onDownloadZip: () => void;
  onAnalyzeProject: () => void;
  onGenerateTests: () => void;
  onGenerateDocs: () => void;
  isReviewing: boolean;
  isTesting: boolean;
  isDocGen: boolean;
}

const FileExplorer: React.FC<FileExplorerProps> = ({
  fileCache,
  activeFilePath,
  onFileSelect,
  onDownloadZip,
  onAnalyzeProject,
  onGenerateTests,
  onGenerateDocs,
  isReviewing,
  isTesting,
  isDocGen,
}) => {
  return (
    <div className="w-1/4 bg-gray-800 p-4 border-r border-gray-700 flex flex-col">
      <div>
        <h3 className="font-bold mb-2">Fichiers du projet</h3>
        <div className="max-h-64 overflow-y-auto">
          {Object.keys(fileCache).sort().map(path => (
            <div
              key={path}
              className={`p-2 rounded-md cursor-pointer hover:bg-blue-500 text-sm ${activeFilePath === path ? 'bg-blue-600' : ''}`}
              onClick={() => onFileSelect(path)}
            >
              {path}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <button onClick={onDownloadZip} className="w-full bg-green-600 text-white font-bold rounded-md py-2 px-4 hover:bg-green-500 transition">
          Télécharger .zip
        </button>
        <button onClick={onAnalyzeProject} disabled={isReviewing} className="w-full text-base py-2 bg-indigo-600 hover:bg-indigo-500 rounded-md">
          {isReviewing ? 'Analyse en cours...' : '✨ Analyser le Projet'}
        </button>
        <button onClick={onGenerateTests} disabled={isTesting} className="w-full text-base py-2 bg-indigo-600 hover:bg-indigo-500 rounded-md">
          {isTesting ? 'Génération en cours...' : '✨ Générer des Tests'}
        </button>
        <button onClick={onGenerateDocs} disabled={isDocGen} className="w-full text-base py-2 bg-indigo-600 hover:bg-indigo-500 rounded-md">
          {isDocGen ? 'Génération en cours...' : '✨ Documenter le Projet'}
        </button>
      </div>
    </div>
  );
};

export default FileExplorer;
