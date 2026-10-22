/**
 * Film in Recruiting (P014): uploading a recruit's video (MP4, MOV, M4V, up to 100 MB) needs the recruit-documents
 * bucket to take video, which supabase/migrations/20260930140000_recruit_documents_film.sql does. That migration was
 * applied to production on 2026-10-21 (supabase/migrations/HELD.md), so Storage accepts film and the page offers it:
 * the Film category, video types in the file picker, and film in the page's copy. Set this to false to hide film again
 * (the bucket would still accept it).
 */
export const RECRUIT_FILM_ENABLED = true;
