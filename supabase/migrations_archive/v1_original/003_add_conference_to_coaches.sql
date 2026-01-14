-- Add conference column to coaches table
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS conference TEXT;
