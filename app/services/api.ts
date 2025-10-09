// app/services/api.ts

/**
 * Détermine l'URL de base de l'API en fonction de l'environnement.
 * En production, il utilisera la variable d'environnement NEXT_PUBLIC_API_URL.
 * En développement, il pointera vers le backend local.
 */
const getBaseUrl = (): string => {
  // Cette variable est définie par Vercel/Next.js
  if (process.env.NODE_ENV === 'production') {
    // Assurez-vous que cette variable est bien configurée dans vos paramètres Vercel
    return process.env.NEXT_PUBLIC_API_URL || '';
  }
  // URL pour le développement local
  return 'http://127.0.0.1:8000';
};

const API_BASE_URL = getBaseUrl();

/**
 * Une fonction fetch générique pour appeler votre backend.
 * @param endpoint Le point d'accès de l'API (ex: '/api/chat')
 * @param options Les options de la requête fetch (method, headers, body)
 * @returns La réponse JSON de l'API
 */
export const fetchApi = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
  const url = `${API_BASE_URL}${endpoint}`;

  if (!API_BASE_URL && process.env.NODE_ENV === 'production') {
      throw new Error("L'URL de l'API (NEXT_PUBLIC_API_URL) n'est pas configurée pour la production.");
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Réponse invalide du serveur.' }));
      throw new Error(errorData.detail || `Erreur du serveur: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Erreur lors de l'appel à l'API sur ${endpoint}:`, error);
    // Propage l'erreur pour que le composant puisse la gérer
    throw error;
  }
};

/**
 * Une fonction spécifique pour les téléchargements de fichiers qui attend une réponse de type 'blob'.
 * @param endpoint Le point d'accès de l'API pour le téléchargement
 * @returns Un objet Blob représentant le fichier
 */
export const downloadApi = async (endpoint: string): Promise<Blob> => {
    const url = `${API_BASE_URL}${endpoint}`;
     if (!API_BASE_URL && process.env.NODE_ENV === 'production') {
      throw new Error("L'URL de l'API (NEXT_PUBLIC_API_URL) n'est pas configurée pour la production.");
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Réponse invalide du serveur.' }));
            throw new Error(errorData.detail || `Erreur du serveur: ${response.status}`);
        }
        return await response.blob();
    } catch (error) {
        console.error(`Erreur lors du téléchargement depuis ${endpoint}:`, error);
        throw error;
    }
}