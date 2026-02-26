# Templates Email Auth (Supabase)

Ce dossier contient des templates HTML prêts à l'emploi pour Supabase Auth.

## Fichiers

- `confirm_signup.html`: confirmation d'inscription
- `reset_password.html`: réinitialisation de mot de passe (forgot password)
- `magic_link.html`: connexion sans mot de passe
- `change_email.html`: confirmation de changement d'adresse email
- `invite.html`: invitation d'utilisateur
- `reauthentication.html`: réauthentification pour action sensible
- `password_changed_notification.html`: notification après changement de mot de passe

## Variables Supabase utilisées

- `{{ .ConfirmationURL }}`: URL d'action sécurisée générée par Supabase
- `{{ .Email }}`: email de l'utilisateur
- `{{ .NewEmail }}`: nouvelle adresse email (sur le template change email)

## Où les coller dans Supabase Dashboard

1. `Authentication` -> `Email Templates`
2. Remplacer le contenu de chaque template avec le fichier correspondant
3. Sauvegarder

## Correspondance recommandée

- Confirm signup -> `confirm_signup.html`
- Reset password -> `reset_password.html`
- Magic link -> `magic_link.html`
- Change email address -> `change_email.html`
- Invite user -> `invite.html`
- Reauthentication -> `reauthentication.html`

Pour la notification `Password changed`, utiliser `password_changed_notification.html` si la section est disponible côté configuration.
