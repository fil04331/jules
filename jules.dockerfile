# Utiliser une image Python officielle et optimisée
FROM python:3.11-slim

# Définir le répertoire de travail dans le conteneur
WORKDIR /app

# Copier le fichier de dépendances
COPY requirements.txt .

# Installer les dépendances
# --no-cache-dir pour ne pas stocker le cache, --upgrade pip pour avoir la dernière version
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Copier le reste du code de l'application
COPY . .

# Exposer le port que le conteneur écoutera.
# Cloud Run injecte la variable d'environnement PORT (souvent 8080).
# Notre main.py est configuré pour écouter sur $PORT, mais nous mettons 8080 comme un défaut solide.
EXPOSE 8080

# Commande pour lancer l'application avec uvicorn.
# --host 0.0.0.0 pour écouter sur toutes les interfaces réseau.
# --port 8080 est le port standard pour Cloud Run, et notre main.py s'adaptera si $PORT est différent.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]