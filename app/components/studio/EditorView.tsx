// app/components/studio/EditorView.tsx
import React from 'react';
import FileExplorer from './FileExplorer';
import CodeEditor from './CodeEditor';
import AnalysisPanel from './AnalysisPanel';

// Define the props for EditorView, which will be a combination of props needed by its children.
interface EditorViewProps {
  // General
  setView: (view: 'main' | 'editor') => void;

  // FileExplorer Props
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

  // CodeEditor does not need direct props other than what's already listed for FileExplorer.

  // AnalysisPanel Props
  patchConversation: { role: string; text: string; isHtml: boolean }[];
  patchInput: string;
  setPatchInput: (value: string) => void;
  handleApplyPatch: (e: React.FormEvent) => void;
  isPatching: boolean;
}

const EditorView: React.FC<EditorViewProps> = (props) => {
  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col text-white">
      <header className="bg-gray-800 p-3 flex justify-between items-center border-b border-gray-700">
        <h2 className="text-xl font-bold">Éditeur de Projet</h2>
        <button onClick={() => props.setView('main')} className="bg-red-600 text-white font-bold rounded-md py-1 px-3 hover:bg-red-500 transition">
          Fermer
        </button>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <FileExplorer
          fileCache={props.fileCache}
          activeFilePath={props.activeFilePath}
          onFileSelect={props.onFileSelect}
          onDownloadZip={props.onDownloadZip}
          onAnalyzeProject={props.onAnalyzeProject}
          onGenerateTests={props.onGenerateTests}
          onGenerateDocs={props.onGenerateDocs}
          isReviewing={props.isReviewing}
          isTesting={props.isTesting}
          isDocGen={props.isDocGen}
        />
        <CodeEditor
          activeFilePath={props.activeFilePath}
          fileCache={props.fileCache}
        />
        <AnalysisPanel
          patchConversation={props.patchConversation}
          patchInput={props.patchInput}
          setPatchInput={props.setPatchInput}
          handleApplyPatch={props.handleApplyPatch}
          activeFilePath={props.activeFilePath}
          isPatching={props.isPatching}
        />
      </div>
    </div>
  );
};

export default EditorView;
