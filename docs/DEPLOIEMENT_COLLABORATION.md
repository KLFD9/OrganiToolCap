# Déployer la collaboration en production

L’interface reste hébergée sur Vercel. Deux petits services réseau complètent le
mode collaboratif :

1. le relais WebSocket met les navigateurs en relation ;
2. TURN prend le relais lorsque le réseau d’entreprise bloque le pair-à-pair.

Le document RH n’est stocké par aucun de ces services. Il reste dans les
navigateurs et dans le fichier `.orgchart.json`.

## 1. Préparer le serveur réseau

Utiliser une petite machine Linux avec Docker, une adresse IPv4 publique et un
sous-domaine, par exemple `collaboration.example.com`.

Copier `infra/collaboration/.env.example` vers `.env`, puis renseigner :

- l’URL Vercel dans `APP_ORIGINS` ;
- l’adresse IPv4 publique dans `TURN_EXTERNAL_IP` ;
- un secret aléatoire d’au moins 32 octets dans `TURN_SHARED_SECRET`.

Lancer depuis `infra/collaboration` :

```bash
docker compose up -d --build
```

Ouvrir les ports TCP `4444`, TCP/UDP `3478` et UDP `49160-49200`. Placer le port
`4444` derrière un reverse proxy HTTPS qui transmet les WebSockets, par exemple
sur `wss://collaboration.example.com/signal`.

Vérifier ensuite :

```text
https://collaboration.example.com/healthz
```

La réponse doit contenir `"status":"ok"`.

## 2. Configurer Vercel

Ajouter ces variables d’environnement au projet :

```text
VITE_COLLAB_SIGNALING_URLS=wss://collaboration.example.com/signal
VITE_COLLAB_TURN_CREDENTIALS_URL=/api/turn-credentials
COLLAB_ALLOWED_ORIGINS=https://votre-projet.vercel.app,https://votre-domaine.fr
TURN_URLS=turn:collaboration.example.com:3478?transport=udp,turn:collaboration.example.com:3478?transport=tcp
TURN_SHARED_SECRET=le-même-secret-que-sur-le-serveur
TURN_CREDENTIAL_TTL_SECONDS=600
```

`TURN_SHARED_SECRET` ne doit jamais être préfixé par `VITE_` : il reste ainsi
dans la fonction Vercel et n’entre pas dans le JavaScript envoyé au navigateur.

Redéployer l’application après modification des variables `VITE_`.

## 3. Contrôler dans OrganiTool

Créer une session depuis « Partager en direct ». La fenêtre doit afficher :

- « Relais de connexion : Privé » ;
- « Secours réseau TURN : Opérationnel ».

Tester avec deux réseaux différents, idéalement un poste d’entreprise et un
téléphone en 4G/5G. Vérifier le déplacement d’une fiche, les curseurs, le
rechargement de la page et la reconnexion.

## Limites et exploitation

- Vercel sert l’interface et les identifiants TURN temporaires, pas le WebSocket.
- Le lien de partage donne actuellement le droit de modifier : ne pas le publier.
- Surveiller `/healthz` sans collecter le nom des sessions.
- Protéger `/api/turn-credentials` par les limites de débit Vercel afin d’éviter
  qu’un tiers consomme inutilement la bande passante TURN.
- Faire tourner `TURN_SHARED_SECRET` si un lien ou une configuration est exposé.
- Ajouter ensuite un mode lecture seule et la révocation des liens.
