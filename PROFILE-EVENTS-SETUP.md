# Profiles and event management

This release includes all changes from the previous v2 ZIP: light default, dark mode, mobile layout, trending slider, sharing logos and corrected map markers.

## Features

- Account page: banner, circular avatar, editable display name, local image previews and remove buttons. Avatars appear beside comments. No public profile directory or email exposure is added.
- JPG/PNG/WEBP uploads reuse the existing validated, database-backed image storage: 4 MB and 20 megapixel limits, metadata removed and images re-encoded. Suggested dimensions: avatar 400 × 400, banner 1500 × 500. Images are center-cropped; there is no manual crop editor.
- Owners can edit their published, pending and rejected events from the account page or event detail page. Saving moves the event to pending moderation and temporarily hides it from the public catalog/map. Existing registrations, comments and event ID remain intact. Moderators use the existing approval/rejection controls. No previous published revision is kept.
- Owners can delete their events after an explicit browser confirmation. The API also allows administrators to delete. Event registrations and comments are removed in the same database transaction. There is no restore button. Image blobs are not automatically deleted because they can be referenced elsewhere.

## Install

1. Back up your current project and database.
2. Replace source files from the complete ZIP, or extract the changes-only ZIP into the repository folder containing `main.py`. The changes-only ZIP is cumulative against `LETOMEET-main (3).zip`.
3. Keep your existing secrets, database, uploads and hosting variables. No additional package or email configuration is required.
4. Deploy/restart. A new `profile` table is created by the application's existing `db.create_all()` startup step. Existing user/event columns are unchanged. The database role must be allowed to create this table. If your production role cannot create tables, have the database owner run the SQL below before deploying.
5. Reload the site. Open **Личный кабинет → Редактировать профиль**. Editing/deletion controls appear next to owned events.

Optional PostgreSQL table creation (run only against the intended existing app database/schema):

```sql
CREATE TABLE IF NOT EXISTS profile (
    user_id INTEGER PRIMARY KEY REFERENCES "user"(id),
    avatar_url VARCHAR(500),
    banner_url VARCHAR(500)
);
```

Users with events that have no `creator_id` cannot claim them through this update. An administrator must first assign ownership to the correct account through a controlled database update.

Profile images use the existing public `/media/` URLs. Removing an avatar/banner clears the profile reference but does not erase the stored image blob. Profile name changes update comment author labels; they do not rewrite the independently editable organizer field of old events.

## Validation

23 backend tests pass, including profile authorization/image ownership, event ownership, moderation gating after edits, retained registrations/comments, and deletion cleanup. Frontend syntax and existing discovery/sharing/theme/map checks pass. Browser checks cover profile saving and the published-event edit flow using an isolated demo database. No live accounts/events were changed and no deployment was performed.
