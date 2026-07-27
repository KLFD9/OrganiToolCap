# OrganiTool CAP — Point d’avancement

## Collaboration en direct

- Partage d’un organigramme par lien, sans création de compte.
- Participants identifiés par prénom ou pseudonyme et couleur.
- Curseurs et sélections visibles en temps réel.
- Modifications synchronisées sur les fiches, liens, positions, pages et éléments de page.
- Plusieurs champs d’une même fiche peuvent être modifiés en parallèle sans écraser tout le document.
- Session reprise localement après une coupure ou un rechargement.

## Fiabilité

- Correction du clignotement de la feuille chez la personne invitée.
- Les curseurs sont maintenant affichés dans un calque indépendant du document.
- Protection contre les doubles responsables et les cycles créés simultanément.
- Conservation des rattachements fonctionnels pendant les réparations.
- Suppression automatique des liens devenus orphelins.
- Le fichier OrganiTool reste enregistrable et partageable hors session.

## Sécurité

- Le lien contient une clé secrète dans une partie non envoyée au serveur web.
- La connexion ne démarre qu’après une action explicite de partage ou de participation.
- Aucun suivi d’usage ni analytics ajouté.
- Relais privé durci : contrôle des sites autorisés, quotas et limites de taille.
- Identifiants TURN temporaires générés à la demande, sans secret dans le navigateur.
- État du relais et du secours réseau visible dans la fenêtre de partage.
- Dépendances vulnérables mises à jour.

## Import et suivi des équipes

- Import direct Excel et CSV avec choix de feuille et correspondance des colonnes.
- Aperçu avant remplacement du document.
- Comparaison de deux versions : arrivées, départs, changements de poste, pôle, responsable et rattachements.

## Pages et identité

- Logos différents par page.
- Remplacement d’un logo en conservant sa taille et son emplacement.
- Logos toujours déplaçables et redimensionnables.
- Rendu cohérent dans les exports PDF et PowerPoint.

## Prochaines priorités

- Déployer le relais privé et le serveur TURN avec le guide fourni.
- Ajouter un lien en lecture seule et la révocation des accès.
- Ajouter les commentaires et leur résolution.
- Ajouter un historique de versions d’équipe avec restauration.
