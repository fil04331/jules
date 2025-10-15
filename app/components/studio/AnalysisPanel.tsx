// app/components/studio/AnalysisPanel.tsx
import React, { useEffect, useRef } from 'react';

interface AnalysisPanelProps {
  patchConversation: { role: string; text: string; isHtml: boolean }[];
  patchInput: string;
  setPatchInput: (value: string) => void;
  handleApplyPatch: (e: React.FormEvent) => void;
  activeFilePath: string | null;
  isPatching: boolean;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  patchConversation,
  patchInput,
  setPatchInput,
  handleApplyPatch,
  activeFilePath,
  isPatching,
}) => {
  const patchConversationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (patchConversationRef.current) {
      patchConversationRef.current.scrollTop = patchConversationRef.current.scrollHeight;
    }
  }, [patchConversation]);

  return (
    <div className="w-1/4 bg-gray-800 p-4 border-l border-gray-700 flex flex-col">
      <h3 className="font-bold mb-2">Analyse & Modification</h3>
      <div ref={patchConversationRef} className="flex-1 bg-gray-900 rounded-md p-2 overflow-y-auto text-sm space-y-2">
        {patchConversation.map((msg, index) => (
          <div key={index} className={`p-2 rounded-lg ${msg.role === 'user' ? 'bg-blue-900 self-end' : 'bg-gray-700 self-start'}`}>
            {msg.isHtml ? <div dangerouslySetInnerHTML={{ __html: msg.text }} /> : <pre className="whitespace-pre-wrap font-sans">{msg.text}</pre>}
          </div>
        ))}
      </div>
      <form onSubmit={handleApplyPatch} className="mt-2">
        <textarea
          value={patchInput}
          onChange={(e) => setPatchInput(e.target.value)}
          placeholder="Demandez une modification pour le fichier actuel..."
          className="w-full h-20 bg-gray-700 border border-gray-600 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          disabled={!activeFilePath || isPatching}
        />
        <button type="submit" disabled={!activeFilePath || isPatching} className="w-full mt-2 bg-purple-600 text-white font-bold rounded-md py-2 hover:bg-purple-500 disabled:bg-gray-600">
          {isPatching ? 'Application...' : 'Appliquer le Patch'}
        </button>
      </form>
    </div>
  );
};

export default AnalysisPanel;
