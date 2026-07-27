# Déployer la collaboration en production

## Vercel seul : le mode recommandé

Le partage en direct fonctionne sans compte, sans base de données et sans
variable d’environnement. Vercel sert uniquement l’application statique.

Après une action explicite sur « Partager en direct » ou « Rejoindre » :

1. plusieurs relais Nostr publics et interchangeables aident les navigateurs à
   se découvrir ;
2. WebRTC établit ensuite la connexion directe entre participants ;
3. le document est chiffré avec la clé présente dans le fragment `#session` du
   lien, fragment qui n’est pas envoyé à Vercel.

Les relais de découverte ne stockent pas l’organigramme. Le fichier
`.orgchart.json` reste la source de vérité et la session conserve un brouillon
local dans chaque navigateur.

## Déploiement

1. Déployer la branche principale sur Vercel.
2. Ne configurer aucune variable pour la collaboration standard.
3. Ouvrir l’application dans deux navigateurs ou deux appareils.
4. Créer un lien depuis « Partager en direct », puis le rejoindre avec un
   pseudonyme différent.
5. Vérifier que la fenêtre indique « Découverte : opérationnelle », deux
   participants, puis déplacer une fiche et contrôler le curseur distant.

## Secours TURN facultatif

Certains réseaux d’entreprise bloquent toutes les connexions directes WebRTC.
Dans ce cas seulement, déployer le service TURN décrit dans
`infra/collaboration`, puis ajouter dans Vercel :

```text
VITE_COLLAB_TURN_CREDENTIALS_URL=/api/turn-credentials
COLLAB_ALLOWED_ORIGINS=https://votre-projet.vercel.app,https://votre-domaine.fr
TURN_URLS=turn:collaboration.example.com:3478?transport=udp,turn:collaboration.example.com:3478?transport=tcp
TURN_SHARED_SECRET=un-secret-aleatoire-d-au-moins-32-octets
TURN_CREDENTIAL_TTL_SECONDS=600
```

`TURN_SHARED_SECRET` ne doit jamais être préfixé par `VITE_` : il reste dans la
fonction Vercel et n’entre pas dans le JavaScript envoyé au navigateur.

Le fichier `infra/collaboration/docker-compose.yml` ne déploie que coturn. Il
faut une adresse IPv4 publique, ouvrir TCP/UDP `3478` et UDP `49160-49200`, puis
renseigner les variables décrites dans `infra/collaboration/.env.example`.

## Sécurité et limites

- Toute personne possédant le lien peut actuellement modifier le document.
- Ne pas publier un lien de session dans un espace public.
- Aucun nom, e-mail, contenu RH ou identifiant de session n’est journalisé.
- Les identifiants TURN sont temporaires et générés uniquement à la demande.
- La première reconnexion après un rechargement peut prendre quelques secondes.
- Les prochaines protections prévues sont le mode lecture seule et la
  révocation d’un lien.
