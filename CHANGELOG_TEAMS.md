# OrganiTool CAP — Point d’avancement

## Collaboration en direct

- Partage d’un organigramme par lien, sans création de compte.
- Fonctionne directement sur Vercel, sans serveur de collaboration à déployer.
- Remplacement du relais public défaillant par une découverte décentralisée et
  redondante.
- Document chiffré par la clé du lien et échangé directement entre navigateurs.
- Participants identifiés par prénom ou pseudonyme et couleur.
- Curseurs, sélections et déplacements visibles en temps réel.
- La fiche qu’un participant est en train de modifier est signalée en direct,
  sans transmettre le contenu du champ avant sa synchronisation normale.
- Modifications synchronisées sur les fiches, liens, pages et éléments de page.
- Reconnexion et brouillon local après une coupure ou un rechargement.

## Fiabilité

- Correction du clignotement de la feuille chez la personne invitée.
- Les curseurs sont affichés dans un calque indépendant du document.
- La fenêtre distingue la découverte des participants de la synchronisation du
  document et indique clairement un problème réseau.
- Une coupure en cours de session affiche maintenant « Reconnexion… » dans la
  barre principale ; le travail local continue et sera resynchronisé.
- « En attente » remplace l’ancien « 1 en direct » tant qu’aucun autre
  participant n’a réellement rejoint le lien.
- Les micro-coupures de moins de deux secondes ne font plus clignoter l’état
  de collaboration.
- Les anciens brouillons avec des identifiants de pages dupliqués sont réparés
  automatiquement pour éviter les pages instables ou confondues.
- Protection contre les doubles responsables et les cycles créés simultanément.
- Conservation des rattachements fonctionnels pendant les réparations.
- Suppression automatique des liens devenus orphelins.
- Le fichier OrganiTool reste enregistrable et partageable hors session.

## Sécurité

- La collaboration démarre seulement après une action explicite.
- Le secret de session reste dans le lien et n’est pas envoyé à Vercel.
- Aucun compte, suivi d’usage ou outil d’analytics ajouté.
- Secours TURN facultatif avec identifiants temporaires pour les réseaux
  d’entreprise restrictifs.
- Dépendances de production auditées : aucune vulnérabilité connue par npm.

## Import et suivi des équipes

- Import direct Excel et CSV avec choix de feuille et correspondance des colonnes.
- Aperçu avant remplacement du document.
- Comparaison de versions : arrivées, départs, postes, pôles, responsables et
  rattachements.

## Pages et identité

- Logos différents par page.
- Remplacement d’un logo en conservant sa taille et son emplacement.
- Logos déplaçables et redimensionnables.
- Rendu cohérent dans les exports PDF et PowerPoint.

## Prochaines priorités

- Ajouter un lien en lecture seule et la révocation des accès.
- Ajouter les commentaires et leur résolution.
- Ajouter un historique de versions d’équipe avec restauration.
- Ajouter un espace d’accueil des sessions récentes, toujours sans compte.
