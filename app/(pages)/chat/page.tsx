"use client";

import React, { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '../../services/api';

// --- Types ---
type Message = {
  id: string; // Unique ID for each message
  role: 'user' | 'model';
  parts: string;
};

// --- Composant Principal de l'Application ---
export default function ChatPage() {
  // --- State Hooks ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState('');
  const [parentMessageId, setParentMessageId] = useState<string | null>(null);

  // NOUVEAU: États pour la gestion de l'upload
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  // --- Refs ---
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // NOUVEAU: Ref pour l'input de fichier caché
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Effets ---
  useEffect(() => {
    // Initialisation des IDs de l'utilisateur et de la session
    if (!userId) setUserId(`web-user-${crypto.randomUUID()}`);
    if (!sessionId) setSessionId(`session-${crypto.randomUUID()}`);
  }, [userId, sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Fonctions ---
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isUploading) return;

    let currentMessages = messages;
    // If we are branching, slice the conversation history
    if (parentMessageId) {
      const parentIndex = messages.findIndex(msg => msg.id === parentMessageId);
      if (parentIndex > -1) {
        currentMessages = messages.slice(0, parentIndex + 1);
      }
    }

    const userMessage: Message = { role: 'user', parts: input, id: `temp-user-${Date.now()}` };
    setMessages([...currentMessages, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);
    setError('');

    // Add a placeholder for the model's message
    setMessages(prev => [...prev, { role: 'model', parts: '', id: `temp-model-${Date.now()}` }]);

    try {
      const response = await fetch(getApiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: currentInput,
          session_id: sessionId,
          parent_message_id: parentMessageId
        }),
      });

      // Reset parent message ID after sending
      if (parentMessageId) {
        setParentMessageId(null);
      }

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      const decoder = new TextDecoder();
      let isFirstChunk = true;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        let chunk = decoder.decode(value, { stream: true });

        if (isFirstChunk && chunk.startsWith('__IDS__::')) {
          const [_, userMsgId, modelMsgId] = chunk.split('::');
          setMessages(prev => {
            const updatedMessages = [...prev];
            updatedMessages[updatedMessages.length - 2].id = userMsgId.trim();
            updatedMessages[updatedMessages.length - 1].id = modelMsgId.trim();
            return updatedMessages;
          });
          isFirstChunk = false;
          // Continue to the next iteration to avoid processing the ID line as text
          continue;
        }

        setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            const updatedLastMessage = { ...lastMessage, parts: lastMessage.parts + chunk };
            return [...prev.slice(0, -1), updatedLastMessage];
        });
      }

    } catch (err: any) {
      setError(err.message);
      const errorMessage: Message = { role: 'model', parts: `Désolé, une erreur est survenue : ${err.message}` };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBranchClick = (messageId: string, messageText: string) => {
    setParentMessageId(messageId);
    setInput(messageText); // Pre-fill input for editing
    // Focus the input field
    const inputElement = document.querySelector('input[type="text"]');
    if (inputElement) {
      (inputElement as HTMLInputElement).focus();
    }
  };

  const cancelBranching = () => {
    setParentMessageId(null);
    setInput('');
  };

  // NOUVEAU: Gère la sélection et l'upload du fichier
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation côté client
    const allowedTypes = ['text/plain', 'application/pdf'];
    const maxSize = 5 * 1024 * 1024; // 5 MB

    if (!allowedTypes.includes(file.type)) {
      setUploadStatus(`❌ Erreur: Type de fichier non supporté. Uniquement .txt et .pdf.`);
      setTimeout(() => setUploadStatus(''), 4000);
      return;
    }

    if (file.size > maxSize) {
      setUploadStatus(`❌ Erreur: Fichier trop volumineux. La limite est de 5 Mo.`);
      setTimeout(() => setUploadStatus(''), 4000);
      return;
    }

    setIsUploading(true);
    setUploadStatus(`⏳ Ajout de "${file.name}" à l'entrepôt...`);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Appel à l'endpoint d'upload du backend via fetchApi
      await fetchApi('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      setUploadStatus(`✅ "${file.name}" a été ajouté avec succès à la mémoire de Jules.`);

    } catch (err: any) {
      setUploadStatus(`❌ Erreur: ${err.message}`);
    } finally {
      setIsUploading(false);
      // Réinitialise l'input pour permettre de re-uploader le même fichier
      e.target.value = ''; 
      setTimeout(() => setUploadStatus(''), 5000);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white font-sans">
      <header className="bg-gray-800 p-4 shadow-md z-10">
        <h1 className="text-xl font-bold text-center text-gray-200">Jules.google</h1>
      </header>
      
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-3xl mx-auto">
          {messages.map((msg, index) => (
            <div key={msg.id} className={`group flex items-center my-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {/* Branch button for model messages */}
              {msg.role === 'model' && msg.id && !msg.id.startsWith('temp-') && (
                <button
                  onClick={() => handleBranchClick(msg.id, msg.parts)}
                  className="mr-2 p-1 text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Branch from this message"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-4m0 0l-4-4m4 4H4" /></svg>
                </button>
              )}
              <div className={`relative rounded-2xl px-4 py-2 max-w-lg lg:max-w-xl break-words ${ msg.role === 'user' ? 'bg-blue-600 rounded-br-none' : 'bg-gray-700 rounded-bl-none' } ${parentMessageId === msg.id ? 'ring-2 ring-green-500' : ''}`}>
                <p className="whitespace-pre-wrap">{msg.parts}</p>
              </div>
              {/* Branch button for user messages */}
              {msg.role === 'user' && msg.id && !msg.id.startsWith('temp-') && (
                <button
                  onClick={() => handleBranchClick(msg.id, msg.parts)}
                  className="ml-2 p-1 text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Branch from this message"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-4m0 0l-4-4m4 4H4" /></svg>
                </button>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start my-3">
              <div className="bg-gray-700 rounded-2xl px-4 py-3 max-w-xs rounded-bl-none"><div className="flex items-center space-x-2"><span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-75"></span><span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-150"></span><span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-300"></span></div></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="bg-gray-800/80 backdrop-blur-sm p-4 border-t border-gray-700">
        <div className="max-w-3xl mx-auto">
          {/* NOUVEAU: Afficheur de statut d'upload */}
          {uploadStatus && <p className="text-center text-sm text-gray-400 mb-2 transition-opacity duration-300">{uploadStatus}</p>}

          {/* Branching Indicator */}
          {parentMessageId && (
            <div className="flex items-center justify-center text-sm text-green-400 mb-2">
              <span>Branching from a previous message.</span>
              <button onClick={cancelBranching} className="ml-2 text-xs text-red-400 hover:text-red-300">[ Cancel ]</button>
            </div>
          )}

          <div className="flex items-center space-x-2">
            {/* NOUVEAU: Bouton d'upload */}
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".txt,.pdf" style={{ display: 'none' }} disabled={isUploading || isLoading} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isLoading}
              className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition duration-200"
              aria-label="Ajouter un fichier"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
            </button>
            
            <form onSubmit={handleSendMessage} className="flex-1 flex items-center space-x-2">
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Discutez avec Jules..." disabled={isLoading || isUploading} className="flex-1 w-full bg-gray-700 border border-gray-600 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 disabled:opacity-50" />
              <button type="submit" disabled={!input.trim() || isLoading || isUploading} className="bg-blue-600 text-white rounded-full p-2 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
              </button>
            </form>
          </div>
          {/* NOUVEAU: Indication des limites */}
          <p className="text-xs text-center text-gray-500 mt-2">
            Vous pouvez ajouter un fichier à la fois (.txt, .pdf, max 5 Mo).
          </p>
        </div>
      </footer>
    </div>
  );
}
