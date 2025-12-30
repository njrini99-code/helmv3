/**
 * Analysis Cache - Persist and cache analysis results
 * 
 * Features:
 * - Cache LLM responses by content hash
 * - Persist analysis between sessions
 * - Track analysis history
 * - TTL-based invalidation
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export class AnalysisCache {
  constructor(cacheDir) {
    this.cacheDir = cacheDir;
    this.memoryCache = new Map();
    this.ttl = 24 * 60 * 60 * 1000; // 24 hours
    this.maxMemoryItems = 100;
  }

  /**
   * Initialize cache directory
   */
  async init() {
    await fs.mkdir(this.cacheDir, { recursive: true });
    await this.loadIndex();
  }

  /**
   * Generate cache key from content
   */
  generateKey(route, code, screenshot = null) {
    const content = `${route}:${code || ''}:${screenshot ? 'has-ss' : 'no-ss'}`;
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Get cached analysis
   */
  async get(route, code, screenshot = null) {
    const key = this.generateKey(route, code, screenshot);
    
    // Check memory cache first
    if (this.memoryCache.has(key)) {
      const cached = this.memoryCache.get(key);
      if (Date.now() - cached.timestamp < this.ttl) {
        return { ...cached.data, fromCache: true };
      }
      this.memoryCache.delete(key);
    }
    
    // Check disk cache
    try {
      const filePath = path.join(this.cacheDir, `${key}.json`);
      const content = await fs.readFile(filePath, 'utf8');
      const cached = JSON.parse(content);
      
      if (Date.now() - cached.timestamp < this.ttl) {
        // Promote to memory
        this.memoryCache.set(key, cached);
        this.pruneMemory();
        return { ...cached.data, fromCache: true };
      }
      
      // Expired, delete
      await fs.unlink(filePath);
    } catch {
      // No cache
    }
    
    return null;
  }

  /**
   * Store analysis in cache
   */
  async set(route, code, screenshot, data) {
    const key = this.generateKey(route, code, screenshot);
    
    const cached = {
      key,
      route,
      timestamp: Date.now(),
      data,
    };
    
    // Store in memory
    this.memoryCache.set(key, cached);
    this.pruneMemory();
    
    // Store on disk
    try {
      const filePath = path.join(this.cacheDir, `${key}.json`);
      await fs.writeFile(filePath, JSON.stringify(cached, null, 2));
    } catch (error) {
      console.error('Cache write error:', error.message);
    }
  }

  /**
   * Invalidate cache for a route
   */
  async invalidate(route) {
    // Remove from memory
    for (const [key, cached] of this.memoryCache) {
      if (cached.route === route) {
        this.memoryCache.delete(key);
      }
    }
    
    // Remove from disk
    try {
      const files = await fs.readdir(this.cacheDir);
      for (const file of files) {
        try {
          const filePath = path.join(this.cacheDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const cached = JSON.parse(content);
          if (cached.route === route) {
            await fs.unlink(filePath);
          }
        } catch {
          await fs.unlink(path.join(this.cacheDir, file)).catch(() => {});
        }
      }
    } catch {
      // Cache dir doesn't exist
    }
  }

  /**
   * Prune memory cache to max size
   */
  pruneMemory() {
    if (this.memoryCache.size <= this.maxMemoryItems) return;
    
    const entries = Array.from(this.memoryCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = entries.slice(0, entries.length - this.maxMemoryItems);
    for (const [key] of toRemove) {
      this.memoryCache.delete(key);
    }
  }

  /**
   * Load cache index
   */
  async loadIndex() {
    try {
      const files = await fs.readdir(this.cacheDir);
      console.log(`   📦 Cache: ${files.length} entries`);
    } catch {
      console.log('   📦 Cache: initialized');
    }
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      memoryItems: this.memoryCache.size,
      maxMemory: this.maxMemoryItems,
      ttlHours: this.ttl / (60 * 60 * 1000),
    };
  }
}

export default AnalysisCache;
