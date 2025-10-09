'use client';

import { useState, useEffect, useRef } from 'react';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';
import JSZip from 'jszip';
import styles from './Studio.module.css';

// Helper function to add a message to a conversation panel
const addMessage = (setter: Function, role: 'user' | 'model' | 'system', text: string, isHtml: boolean = false) => {
    setter((prev: any[]) => [...prev, { role, text, isHtml }]);
};

export default function StudioPage() {
    // --- State Management ---
    const [view, setView] = useState<'main' | 'editor'>('main');
    const [projectPrompt, setProjectPrompt] = useState<string>('');
    const [repoUrl, setRepoUrl] = useState<string>('');
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [isImporting, setIsImporting] = useState<boolean>(false);

    // File and editor state
    const [fileCache, setFileCache] = useState<Record<string, string>>({});
    const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
    const codeBlockRef = useRef<HTMLElement>(null);

    // Patch and analysis state
    const [patchConversation, setPatchConversation] = useState<{role: string; text: string; isHtml: boolean}[]>([]);
    const [patchInput, setPatchInput] = useState<string>('');
    const [isPatching, setIsPatching] = useState<boolean>(false);
    const [isReviewing, setIsReviewing] = useState<boolean>(false);
    const [isTesting, setIsTesting] = useState<boolean>(false);
    const [isDocGen, setIsDocGen] = useState<boolean>(false);

    // --- Effects ---
    // Highlight the code block whenever the active file's content changes
    useEffect(() => {
        if (codeBlockRef.current && activeFilePath && fileCache[activeFilePath]) {
            hljs.highlightElement(codeBlockRef.current);
        }
    }, [activeFilePath, fileCache]);

    // Scroll to the bottom of the patch conversation when it updates
    const patchConversationRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (patchConversationRef.current) {
            patchConversationRef.current.scrollTop = patchConversationRef.current.scrollHeight;
        }
    }, [patchConversation]);


    // --- Core Logic Functions ---
    const handleGenerateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!projectPrompt.trim()) return;

        setIsGenerating(true);
        try {
            const response = await fetch('/api/generate-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: projectPrompt }),
            });

            if (!response.ok) {
                throw new Error(`Erreur du serveur: ${response.statusText}`);
            }

            const data = await response.json();
            setFileCache(data.files);
            const firstFile = Object.keys(data.files)[0];
            if (firstFile) {
                setActiveFilePath(firstFile);
            }
            setView('editor');
        } catch (error) {
            alert(`Erreur de génération : ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleImportRepo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!repoUrl.trim()) return;

        setIsImporting(true);
        try {
            const response = await fetch('/api/import-repo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repo_url: repoUrl }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `Erreur du serveur: ${response.statusText}`);
            }

            const data = await response.json();
            setFileCache(data.files);
            const firstFile = Object.keys(data.files)[0];
            if (firstFile) {
                setActiveFilePath(firstFile);
            }
            setView('editor');
        } catch (error) {
            alert(`Erreur d'importation : ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsImporting(false);
        }
    };

    const handleFileSelect = (filePath: string) => {
        setActiveFilePath(filePath);
    };

    const handleDownloadZip = async () => {
        if (Object.keys(fileCache).length === 0) return;
        const zip = new JSZip();
        for (const filePath in fileCache) {
            zip.file(filePath, fileCache[filePath]);
        }
        const content = await zip.generateAsync({ type: "blob" });

        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = "projet-jules.zip";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    };

    const handleApplyPatch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!patchInput.trim() || !activeFilePath) return;

        addMessage(setPatchConversation, 'user', patchInput);
        const currentCode = fileCache[activeFilePath];
        setIsPatching(true);
        setPatchInput('');

        try {
            const response = await fetch('/api/apply-patch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_path: activeFilePath, code: currentCode, prompt: patchInput }),
            });
            if (!response.ok) throw new Error(`Erreur du serveur: ${response.statusText}`);
            const data = await response.json();

            setFileCache(prev => ({ ...prev, [activeFilePath]: data.updated_code }));
            addMessage(setPatchConversation, 'system', 'Patch appliqué avec succès.');

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            addMessage(setPatchConversation, 'system', `Erreur lors du patch : ${errorMsg}`);
        } finally {
            setIsPatching(false);
        }
    };

    const runProjectAnalysis = async (apiEndpoint: string, stateSetter: Function, buttonText: string, thinkingMessage: string) => {
        if (Object.keys(fileCache).length === 0) {
            addMessage(setPatchConversation, 'system', 'Aucun projet à analyser.');
            return;
        }

        stateSetter(true);
        addMessage(setPatchConversation, 'system', thinkingMessage);

        try {
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: fileCache }),
            });
            if (!response.ok) throw new Error(`Erreur du serveur: ${response.statusText}`);

            const data = await response.json();

            if (apiEndpoint === '/api/review-project') {
                const reviewHtml = data.review
                    .replace(/### (.*?)\n/g, '<strong>$1</strong><br>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/`([^`]+)`/g, '<code class="bg-gray-700 rounded px-1 text-sm">$1</code>')
                    .replace(/\n/g, '<br>');
                addMessage(setPatchConversation, 'model', reviewHtml, true);
            } else if (apiEndpoint === '/api/generate-tests') {
                setFileCache(prev => ({...prev, [data.file_path]: data.code }));
                setActiveFilePath(data.file_path);
                addMessage(setPatchConversation, 'system', `Fichier de test '${data.file_path}' généré et ajouté.`);
            } else if (apiEndpoint === '/api/generate-docs') {
                const readmePath = 'README.md';
                setFileCache(prev => ({ ...prev, [readmePath]: data.readme_content }));
                setActiveFilePath(readmePath);
                addMessage(setPatchConversation, 'system', `Fichier '${readmePath}' généré et ajouté.`);
            }

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            addMessage(setPatchConversation, 'system', `Erreur: ${errorMsg}`);
        } finally {
            stateSetter(false);
        }
    };


    // --- Render Logic ---
    if (view === 'editor') {
        return (
            <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col text-white">
                <header className="bg-gray-800 p-3 flex justify-between items-center border-b border-gray-700">
                    <h2 className="text-xl font-bold">Éditeur de Projet</h2>
                    <button onClick={() => setView('main')} className="bg-red-600 text-white font-bold rounded-md py-1 px-3 hover:bg-red-500 transition">
                        Fermer
                    </button>
                </header>
                <div className="flex flex-1 overflow-hidden">
                    {/* File Explorer */}
                    <div className="w-1/4 bg-gray-800 p-4 border-r border-gray-700 flex flex-col">
                        <div>
                            <h3 className="font-bold mb-2">Fichiers du projet</h3>
                            <div className="max-h-64 overflow-y-auto">
                                {Object.keys(fileCache).sort().map(path => (
                                    <div
                                        key={path}
                                        className={`p-2 rounded-md cursor-pointer hover:bg-blue-500 text-sm ${activeFilePath === path ? 'bg-blue-600' : ''}`}
                                        onClick={() => handleFileSelect(path)}
                                    >
                                        {path}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="mt-4 space-y-2">
                            <button onClick={handleDownloadZip} className="w-full bg-green-600 text-white font-bold rounded-md py-2 px-4 hover:bg-green-500 transition">
                                Télécharger .zip
                            </button>
                            <button onClick={() => runProjectAnalysis('/api/review-project', setIsReviewing, '✨ Analyser le Projet', 'Analyse du projet en cours...')} disabled={isReviewing} className={`${styles.geminiBtn} w-full text-base py-2`}>
                                {isReviewing ? 'Analyse en cours...' : '✨ Analyser le Projet'}
                            </button>
                            <button onClick={() => runProjectAnalysis('/api/generate-tests', setIsTesting, '✨ Générer des Tests', 'Génération des tests...')} disabled={isTesting} className={`${styles.geminiBtn} w-full text-base py-2`}>
                                {isTesting ? 'Génération en cours...' : '✨ Générer des Tests'}
                            </button>
                             <button onClick={() => runProjectAnalysis('/api/generate-docs', setIsDocGen, '✨ Documenter le Projet', 'Génération de la doc...')} disabled={isDocGen} className={`${styles.geminiBtn} w-full text-base py-2`}>
                                {isDocGen ? 'Génération en cours...' : '✨ Documenter le Projet'}
                            </button>
                        </div>
                    </div>

                    {/* Code Editor */}
                    <div className="w-1/2 p-4 flex flex-col">
                        <h3 className="font-mono mb-2 text-gray-400">{activeFilePath || 'Aucun fichier sélectionné'}</h3>
                        <div className="bg-[#282c34] flex-1 rounded-md overflow-auto">
                            <pre className="h-full"><code ref={codeBlockRef} className={`language-${activeFilePath?.split('.').pop() || 'plaintext'} h-full`}>
                                {activeFilePath ? fileCache[activeFilePath] : ''}
                            </code></pre>
                        </div>
                    </div>

                    {/* Patch/Analysis Panel */}
                    <div className="w-1/4 bg-gray-800 p-4 border-l border-gray-700 flex flex-col">
                        <h3 className="font-bold mb-2">Analyse & Modification</h3>
                        <div ref={patchConversationRef} className="flex-1 bg-gray-900 rounded-md p-2 overflow-y-auto text-sm space-y-2">
                           {patchConversation.map((msg, index) => (
                                <div key={index} className={`p-2 rounded-lg ${styles.patchMessage} ${msg.role === 'user' ? 'bg-blue-900 self-end' : 'bg-gray-700 self-start'}`}>
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
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center h-full w-full">
            <div className="w-full max-w-2xl bg-gray-800 p-8 rounded-lg shadow-2xl border border-gray-700">
                <h1 className="text-3xl font-bold text-center text-gray-200 mb-8">Studio de Projet</h1>

                {/* --- Project Generator --- */}
                <div>
                    <h2 className="text-xl font-semibold text-center text-gray-300 mb-4">Générer depuis un Prompt</h2>
                    <form onSubmit={handleGenerateProject} className="flex flex-col">
                        <div className="mb-4">
                            <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-2">Décrivez votre projet</label>
                            <textarea
                                id="prompt"
                                value={projectPrompt}
                                onChange={(e) => setProjectPrompt(e.target.value)}
                                placeholder="Ex: 'Un site portfolio simple en React et Tailwind CSS'"
                                required
                                className="w-full h-24 bg-gray-700 border border-gray-600 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 text-white"
                                disabled={isGenerating || isImporting}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isGenerating || isImporting}
                            className="w-full bg-blue-600 text-white font-bold rounded-md py-3 px-4 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition duration-200"
                        >
                            {isGenerating ? 'Génération en cours...' : "Générer & Ouvrir l'éditeur"}
                        </button>
                    </form>
                </div>

                {/* --- Separator --- */}
                <div className="my-8 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-gray-600" />
                    <div className="px-4 text-gray-400 font-semibold">OU</div>
                    <div className="w-full border-t border-gray-600" />
                </div>

                {/* --- GitHub Importer --- */}
                <div>
                    <h2 className="text-xl font-semibold text-center text-gray-300 mb-4">Importer depuis GitHub</h2>
                    <form onSubmit={handleImportRepo} className="flex flex-col">
                        <div className="mb-4">
                            <label htmlFor="repo_url" className="block text-sm font-medium text-gray-300 mb-2">URL du Dépôt</label>
                            <input
                                id="repo_url"
                                type="url"
                                value={repoUrl}
                                onChange={(e) => setRepoUrl(e.target.value)}
                                placeholder="https://github.com/utilisateur/nom-du-depot"
                                required
                                className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-green-500 transition duration-200 text-white"
                                disabled={isGenerating || isImporting}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isGenerating || isImporting}
                            className="w-full bg-green-600 text-white font-bold rounded-md py-3 px-4 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition duration-200"
                        >
                            {isImporting ? 'Importation en cours...' : "Importer & Ouvrir l'éditeur"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
