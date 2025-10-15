// app/components/studio/CodeEditor.tsx
import React, { useEffect, useRef } from 'react';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';

interface CodeEditorProps {
  activeFilePath: string | null;
  fileCache: Record<string, string>;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ activeFilePath, fileCache }) => {
  const codeBlockRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeBlockRef.current && activeFilePath && fileCache[activeFilePath]) {
      hljs.highlightElement(codeBlockRef.current);
    }
  }, [activeFilePath, fileCache]);

  return (
    <div className="w-1/2 p-4 flex flex-col">
      <h3 className="font-mono mb-2 text-gray-400">{activeFilePath || 'Aucun fichier sélectionné'}</h3>
      <div className="bg-[#282c34] flex-1 rounded-md overflow-auto">
        <pre className="h-full">
          <code ref={codeBlockRef} className={`language-${activeFilePath?.split('.').pop() || 'plaintext'} h-full`}>
            {activeFilePath ? fileCache[activeFilePath] : ''}
          </code>
        </pre>
      </div>
    </div>
  );
};

export default CodeEditor;
