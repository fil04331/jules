// app/components/studio/MainView.tsx
import React from 'react';

interface MainViewProps {
  // Define props that will be passed from the parent page.tsx
  // For example: handlers for generating and importing projects
  handleGenerateProject: (e: React.FormEvent) => void;
  handleImportRepo: (e: React.FormEvent) => void;
  setProjectPrompt: (value: string) => void;
  setRepoUrl: (value: string) => void;
  projectPrompt: string;
  repoUrl: string;
  isGenerating: boolean;
  isImporting: boolean;
}

const MainView: React.FC<MainViewProps> = ({
  handleGenerateProject,
  handleImportRepo,
  setProjectPrompt,
  setRepoUrl,
  projectPrompt,
  repoUrl,
  isGenerating,
  isImporting,
}) => {
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
};

export default MainView;
