# Relais de collaboration OrganiTool

Petit relais WebSocket compatible avec `y-webrtc`. Il transporte uniquement les
messages de mise en relation chiffrés par le client ; il ne stocke ni le document,
ni les noms des participants, ni les sujets de session.

## Variables

- `ALLOWED_ORIGINS` : origines web autorisées, séparées par des virgules.
- `PORT` : port HTTP, `4444` par défaut.
- `SIGNALING_PATH` : chemin WebSocket, `/signal` par défaut.
- `MAX_MESSAGE_BYTES` : taille maximale d’un message, 64 Kio par défaut.
- `MAX_CONNECTIONS` : connexions simultanées maximum, 1 000 par défaut.
- `MAX_CLIENTS_PER_TOPIC` : participants maximum par session, 24 par défaut.
- `MAX_MESSAGES_PER_MINUTE` : limite par connexion, 600 par défaut.

`GET /healthz` fournit uniquement l’état, le nombre de connexions et de sujets.
Le contenu et les identifiants de sujets ne sont jamais journalisés.
