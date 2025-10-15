'use client';

import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import MainView from '@/app/components/studio/MainView';
import EditorView from '@/app/components/studio/EditorView';
import styles from './Studio.module.css'; // Keep styles for shared classes if any

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

    // Patch and analysis state
    const [patchConversation, setPatchConversation] = useState<{role: string; text: string; isHtml: boolean}[]>([]);
    const [patchInput, setPatchInput] = useState<string>('');
    const [isPatching, setIsPatching] = useState<boolean>(false);
    const [isReviewing, setIsReviewing] = useState<boolean>(false);
    const [isTesting, setIsTesting] = useState<boolean>(false);
    const [isDocGen, setIsDocGen] = useState<boolean>(false);

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

    const runProjectAnalysis = async (apiEndpoint: string, stateSetter: Function, thinkingMessage: string) => {
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
            <EditorView
                setView={setView}
                fileCache={fileCache}
                activeFilePath={activeFilePath}
                onFileSelect={handleFileSelect}
                onDownloadZip={handleDownloadZip}
                onAnalyzeProject={() => runProjectAnalysis('/api/review-project', setIsReviewing, 'Analyse du projet en cours...')}
                onGenerateTests={() => runProjectAnalysis('/api/generate-tests', setIsTesting, 'Génération des tests...')}
                onGenerateDocs={() => runProjectAnalysis('/api/generate-docs', setIsDocGen, 'Génération de la doc...')}
                isReviewing={isReviewing}
                isTesting={isTesting}
                isDocGen={isDocGen}
                patchConversation={patchConversation}
                patchInput={patchInput}
                setPatchInput={setPatchInput}
                handleApplyPatch={handleApplyPatch}
                isPatching={isPatching}
            />
        );
    }

    return (
        <MainView
            handleGenerateProject={handleGenerateProject}
            handleImportRepo={handleImportRepo}
            setProjectPrompt={setProjectPrompt}
            setRepoUrl={setRepoUrl}
            projectPrompt={projectPrompt}
            repoUrl={repoUrl}
            isGenerating={isGenerating}
            isImporting={isImporting}
        />
    );
}
