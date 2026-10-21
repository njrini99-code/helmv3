/**
 * Film in Recruiting (P014): uploading a recruit's video (MP4, MOV, M4V, up to 100 MB) needs the recruit-documents
 * bucket to take video, which supabase/migrations/20260930140000_recruit_documents_film.sql does. That migration is
 * held (supabase/migrations/HELD.md), so until it is applied Storage refuses every film and the page hides film
 * (owner default, 2026-10-16): no Film category to pick, no video types in the file picker (on an iPhone they are what
 * offers the Photo Library), a video refused as a type the page doesn't take, and no film in the page's copy. A
 * document already filed as Film keeps its Film tag.
 *
 * After the migration is applied, turning film back on is this one change: set it to true.
 */
export const RECRUIT_FILM_ENABLED = false;
