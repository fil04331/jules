"use client";

import React, { useState } from 'react';
import { fetchApi, downloadApi } from '../services/api'; // Importer les nouvelles fonctions

// Types
type CodeGenResponse = {
  code_id: string;
  filename: string;
};

export default function CodeGeneratorPage() {
  // --- State Hooks ---
  const [prompt, setPrompt] = useState('');
  const [filename, setFilename] = useState('script.py');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CodeGenResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      // Utilisation de la fonction fetchApi
      const data = await fetchApi<CodeGenResponse>('/api/generate-code', {
        method: 'POST',
        body: JSON.stringify({ prompt, filename }),
      });
      setResult(data);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!result) return;

    try {
        const blob = await downloadApi(`/api/download-code/${result.code_id}?filename=${encodeURIComponent(result.filename)}`);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (err: any) {
        setError(`Erreur de téléchargement: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-900 text-white font-sans">
      <header className="bg-gray-800 p-4 shadow-md z-10">
        <h1 className="text-xl font-bold text-center text-gray-200">Jules.google - Code Generator</h1>
      </header>

      <main className="flex-1 p-4 md:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-gray-800/80 backdrop-blur-sm p-6 rounded-lg border border-gray-700">
            <h2 className="text-2xl font-semibold mb-4 text-center">Generate Code from a Prompt</h2>
            <p className="text-gray-400 mb-6 text-center">
              Describe the code you want to create. Jules will generate the file for you to download.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-2">
                  Prompt
                </label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., 'Create a Python script that uses pandas to read a CSV and print the first 5 rows'"
                  required
                  disabled={isLoading}
                  className="w-full h-32 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 disabled:opacity-50"
                />
              </div>

              <div className="mb-6">
                <label htmlFor="filename" className="block text-sm font-medium text-gray-300 mb-2">
                  Filename
                </label>
                <input
                  type="text"
                  id="filename"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  required
                  disabled={isLoading}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !prompt.trim()}
                className="w-full bg-blue-600 text-white font-bold rounded-md py-2 px-4 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
              >
                {isLoading ? 'Generating...' : 'Generate Code'}
              </button>
            </form>

            {/* --- Results and Error Display --- */}
            {error && (
              <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-md text-center">
                <p className="text-red-300">{error}</p>
              </div>
            )}

            {result && (
              <div className="mt-6 text-center">
                <p className="text-green-400 mb-3">✅ Code generated successfully!</p>
                <button
                  onClick={handleDownload}
                  className="inline-block bg-green-600 text-white font-bold rounded-md py-2 px-5 hover:bg-green-500 transition duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                >
                  Download {result.filename}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}