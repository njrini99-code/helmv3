"""
Helm Intelligence - Memory System
Persistent memory for knowledge that spans across audit sessions.
Implements semantic and episodic memory patterns.
"""

import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Optional, Any
from dataclasses import dataclass, field
from uuid import uuid4

from config.settings import Paths


# ============================================
# MEMORY ENTRY TYPES
# ============================================

@dataclass
class MemoryEntry:
    """A single memory entry."""
    id: str = field(default_factory=lambda: uuid4().hex[:12])
    content: str = ""
    memory_type: str = "fact"  # fact, observation, learning, pattern
    category: str = "general"
    tags: list[str] = field(default_factory=list)
    source_agent: str = ""
    source_file: str = ""
    confidence: float = 1.0
    created_at: datetime = field(default_factory=datetime.now)
    last_accessed: datetime = field(default_factory=datetime.now)
    access_count: int = 0
    metadata: dict = field(default_factory=dict)
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "content": self.content,
            "memory_type": self.memory_type,
            "category": self.category,
            "tags": self.tags,
            "source_agent": self.source_agent,
            "source_file": self.source_file,
            "confidence": self.confidence,
            "created_at": self.created_at.isoformat(),
            "last_accessed": self.last_accessed.isoformat(),
            "access_count": self.access_count,
            "metadata": self.metadata,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "MemoryEntry":
        return cls(
            id=data.get("id", uuid4().hex[:12]),
            content=data["content"],
            memory_type=data.get("memory_type", "fact"),
            category=data.get("category", "general"),
            tags=data.get("tags", []),
            source_agent=data.get("source_agent", ""),
            source_file=data.get("source_file", ""),
            confidence=data.get("confidence", 1.0),
            created_at=datetime.fromisoformat(data["created_at"]) if "created_at" in data else datetime.now(),
            last_accessed=datetime.fromisoformat(data["last_accessed"]) if "last_accessed" in data else datetime.now(),
            access_count=data.get("access_count", 0),
            metadata=data.get("metadata", {}),
        )


@dataclass
class EpisodicMemory:
    """
    Episodic memory - captures successful patterns and learnings.
    What worked, what didn't, and why.
    """
    id: str = field(default_factory=lambda: uuid4().hex[:12])
    observation: str = ""
    reasoning: str = ""
    action: str = ""
    outcome: str = ""
    success: bool = True
    category: str = "general"
    tags: list[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "observation": self.observation,
            "reasoning": self.reasoning,
            "action": self.action,
            "outcome": self.outcome,
            "success": self.success,
            "category": self.category,
            "tags": self.tags,
            "created_at": self.created_at.isoformat(),
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "EpisodicMemory":
        return cls(
            id=data.get("id", uuid4().hex[:12]),
            observation=data["observation"],
            reasoning=data["reasoning"],
            action=data["action"],
            outcome=data["outcome"],
            success=data.get("success", True),
            category=data.get("category", "general"),
            tags=data.get("tags", []),
            created_at=datetime.fromisoformat(data["created_at"]) if "created_at" in data else datetime.now(),
        )


# ============================================
# SEMANTIC MEMORY STORE
# ============================================

class SemanticMemory:
    """
    Semantic memory - stores facts and knowledge about the codebase.
    Persists across sessions and provides context to agents.
    """
    
    def __init__(self, base_path: Optional[Path] = None):
        self.base_path = base_path or Paths.MEMORY
        self.base_path.mkdir(parents=True, exist_ok=True)
        self.memories_file = self.base_path / "semantic_memories.json"
        self.index_file = self.base_path / "memory_index.json"
        
        self._memories: dict[str, MemoryEntry] = {}
        self._index: dict[str, list[str]] = {}  # tag -> memory_ids
        
        self._load()
    
    def _load(self):
        """Load memories from disk."""
        if self.memories_file.exists():
            try:
                data = json.loads(self.memories_file.read_text())
                for entry_data in data.get("memories", []):
                    entry = MemoryEntry.from_dict(entry_data)
                    self._memories[entry.id] = entry
            except Exception as e:
                print(f"Warning: Could not load memories: {e}")
        
        if self.index_file.exists():
            try:
                self._index = json.loads(self.index_file.read_text())
            except Exception:
                self._rebuild_index()
        else:
            self._rebuild_index()
    
    def _save(self):
        """Save memories to disk."""
        data = {
            "memories": [m.to_dict() for m in self._memories.values()],
            "updated_at": datetime.now().isoformat(),
        }
        self.memories_file.write_text(json.dumps(data, indent=2))
        self.index_file.write_text(json.dumps(self._index, indent=2))
    
    def _rebuild_index(self):
        """Rebuild the tag index from memories."""
        self._index = {}
        for memory in self._memories.values():
            for tag in memory.tags:
                if tag not in self._index:
                    self._index[tag] = []
                if memory.id not in self._index[tag]:
                    self._index[tag].append(memory.id)
    
    def add(
        self,
        content: str,
        memory_type: str = "fact",
        category: str = "general",
        tags: Optional[list[str]] = None,
        source_agent: str = "",
        source_file: str = "",
        confidence: float = 1.0,
        metadata: Optional[dict] = None,
    ) -> MemoryEntry:
        """Add a new memory entry."""
        # Check for duplicates (by content hash)
        content_hash = hashlib.md5(content.encode()).hexdigest()[:8]
        for existing in self._memories.values():
            existing_hash = hashlib.md5(existing.content.encode()).hexdigest()[:8]
            if content_hash == existing_hash:
                # Update existing instead of adding duplicate
                existing.confidence = max(existing.confidence, confidence)
                existing.access_count += 1
                existing.last_accessed = datetime.now()
                self._save()
                return existing
        
        entry = MemoryEntry(
            content=content,
            memory_type=memory_type,
            category=category,
            tags=tags or [],
            source_agent=source_agent,
            source_file=source_file,
            confidence=confidence,
            metadata=metadata or {},
        )
        
        self._memories[entry.id] = entry
        
        # Update index
        for tag in entry.tags:
            if tag not in self._index:
                self._index[tag] = []
            self._index[tag].append(entry.id)
        
        self._save()
        return entry
    
    def get(self, memory_id: str) -> Optional[MemoryEntry]:
        """Get a memory by ID."""
        if memory := self._memories.get(memory_id):
            memory.access_count += 1
            memory.last_accessed = datetime.now()
            return memory
        return None
    
    def search(
        self,
        query: str,
        tags: Optional[list[str]] = None,
        category: Optional[str] = None,
        memory_type: Optional[str] = None,
        limit: int = 10,
    ) -> list[MemoryEntry]:
        """Search memories by query and filters."""
        results = []
        query_lower = query.lower()
        
        for memory in self._memories.values():
            # Apply filters
            if category and memory.category != category:
                continue
            if memory_type and memory.memory_type != memory_type:
                continue
            if tags and not any(t in memory.tags for t in tags):
                continue
            
            # Simple text matching (in production, use embeddings)
            if query_lower in memory.content.lower():
                results.append(memory)
            elif any(query_lower in tag.lower() for tag in memory.tags):
                results.append(memory)
        
        # Sort by relevance (access count + recency)
        results.sort(
            key=lambda m: (m.confidence, m.access_count, m.last_accessed),
            reverse=True
        )
        
        # Update access counts
        for memory in results[:limit]:
            memory.access_count += 1
            memory.last_accessed = datetime.now()
        
        self._save()
        return results[:limit]
    
    def get_by_tag(self, tag: str) -> list[MemoryEntry]:
        """Get all memories with a specific tag."""
        memory_ids = self._index.get(tag, [])
        return [self._memories[mid] for mid in memory_ids if mid in self._memories]
    
    def get_by_category(self, category: str) -> list[MemoryEntry]:
        """Get all memories in a category."""
        return [m for m in self._memories.values() if m.category == category]
    
    def remove(self, memory_id: str) -> bool:
        """Remove a memory by ID."""
        if memory_id not in self._memories:
            return False
        
        memory = self._memories[memory_id]
        
        # Remove from index
        for tag in memory.tags:
            if tag in self._index and memory_id in self._index[tag]:
                self._index[tag].remove(memory_id)
        
        del self._memories[memory_id]
        self._save()
        return True
    
    def get_context_for_agent(
        self,
        agent_role: str,
        max_entries: int = 20,
    ) -> str:
        """Get relevant memory context for an agent."""
        # Get memories relevant to this agent type
        relevant_categories = {
            "code_auditor": ["code", "typescript", "react", "patterns", "imports"],
            "database_auditor": ["database", "rls", "security", "performance", "schema"],
            "ui_ux_auditor": ["ui", "accessibility", "design", "components", "styling"],
            "enhancement_agent": ["patterns", "improvements", "learnings", "general"],
        }
        
        categories = relevant_categories.get(agent_role, ["general"])
        memories = []
        
        for category in categories:
            memories.extend(self.get_by_category(category))
        
        # Sort by relevance
        memories.sort(
            key=lambda m: (m.confidence, m.access_count),
            reverse=True
        )
        
        # Format as context
        context_parts = ["# Relevant Knowledge from Previous Audits\n"]
        for memory in memories[:max_entries]:
            context_parts.append(f"- [{memory.category}] {memory.content}")
        
        return "\n".join(context_parts)
    
    def get_stats(self) -> dict:
        """Get memory statistics."""
        by_category = {}
        by_type = {}
        
        for memory in self._memories.values():
            by_category[memory.category] = by_category.get(memory.category, 0) + 1
            by_type[memory.memory_type] = by_type.get(memory.memory_type, 0) + 1
        
        return {
            "total_memories": len(self._memories),
            "by_category": by_category,
            "by_type": by_type,
            "total_tags": len(self._index),
        }


# ============================================
# EPISODIC MEMORY STORE
# ============================================

class EpisodicMemoryStore:
    """
    Episodic memory - stores successful patterns and learnings.
    Captures what worked and what didn't for future reference.
    """
    
    def __init__(self, base_path: Optional[Path] = None):
        self.base_path = base_path or Paths.MEMORY
        self.base_path.mkdir(parents=True, exist_ok=True)
        self.episodes_file = self.base_path / "episodic_memories.json"
        
        self._episodes: list[EpisodicMemory] = []
        self._load()
    
    def _load(self):
        """Load episodes from disk."""
        if self.episodes_file.exists():
            try:
                data = json.loads(self.episodes_file.read_text())
                self._episodes = [
                    EpisodicMemory.from_dict(e) for e in data.get("episodes", [])
                ]
            except Exception as e:
                print(f"Warning: Could not load episodes: {e}")
    
    def _save(self):
        """Save episodes to disk."""
        data = {
            "episodes": [e.to_dict() for e in self._episodes],
            "updated_at": datetime.now().isoformat(),
        }
        self.episodes_file.write_text(json.dumps(data, indent=2))
    
    def record(
        self,
        observation: str,
        reasoning: str,
        action: str,
        outcome: str,
        success: bool = True,
        category: str = "general",
        tags: Optional[list[str]] = None,
    ) -> EpisodicMemory:
        """Record a new episode."""
        episode = EpisodicMemory(
            observation=observation,
            reasoning=reasoning,
            action=action,
            outcome=outcome,
            success=success,
            category=category,
            tags=tags or [],
        )
        
        self._episodes.append(episode)
        self._save()
        return episode
    
    def get_successful_patterns(
        self,
        category: Optional[str] = None,
        tags: Optional[list[str]] = None,
        limit: int = 10,
    ) -> list[EpisodicMemory]:
        """Get successful episodes for learning."""
        episodes = [e for e in self._episodes if e.success]
        
        if category:
            episodes = [e for e in episodes if e.category == category]
        
        if tags:
            episodes = [e for e in episodes if any(t in e.tags for t in tags)]
        
        # Most recent first
        episodes.sort(key=lambda e: e.created_at, reverse=True)
        return episodes[:limit]
    
    def get_failed_patterns(
        self,
        category: Optional[str] = None,
        limit: int = 10,
    ) -> list[EpisodicMemory]:
        """Get failed episodes to avoid repeating mistakes."""
        episodes = [e for e in self._episodes if not e.success]
        
        if category:
            episodes = [e for e in episodes if e.category == category]
        
        episodes.sort(key=lambda e: e.created_at, reverse=True)
        return episodes[:limit]
    
    def format_for_context(self, episodes: list[EpisodicMemory]) -> str:
        """Format episodes as context for an agent."""
        if not episodes:
            return ""
        
        lines = ["# Learnings from Previous Audit Sessions\n"]
        
        for ep in episodes:
            status = "✓ Success" if ep.success else "✗ Failed"
            lines.append(f"## {status}: {ep.observation[:50]}...")
            lines.append(f"**Reasoning**: {ep.reasoning}")
            lines.append(f"**Action**: {ep.action}")
            lines.append(f"**Outcome**: {ep.outcome}")
            lines.append("")
        
        return "\n".join(lines)


# ============================================
# CODEBASE KNOWLEDGE BASE
# ============================================

class CodebaseKnowledge:
    """
    Specialized knowledge store for codebase-specific facts.
    Tracks file purposes, component relationships, and conventions.
    """
    
    def __init__(self, base_path: Optional[Path] = None):
        self.base_path = base_path or Paths.MEMORY
        self.base_path.mkdir(parents=True, exist_ok=True)
        self.knowledge_file = self.base_path / "codebase_knowledge.json"
        
        self._knowledge = {
            "files": {},       # filepath -> description
            "components": {},  # component name -> info
            "conventions": [], # coding conventions
            "issues": {},      # recurring issues
            "dependencies": {},# dependency info
        }
        
        self._load()
    
    def _load(self):
        """Load knowledge from disk."""
        if self.knowledge_file.exists():
            try:
                self._knowledge = json.loads(self.knowledge_file.read_text())
            except Exception as e:
                print(f"Warning: Could not load codebase knowledge: {e}")
    
    def _save(self):
        """Save knowledge to disk."""
        self._knowledge["updated_at"] = datetime.now().isoformat()
        self.knowledge_file.write_text(json.dumps(self._knowledge, indent=2))
    
    def set_file_info(self, filepath: str, description: str, metadata: Optional[dict] = None):
        """Record information about a file."""
        self._knowledge["files"][filepath] = {
            "description": description,
            "metadata": metadata or {},
            "updated_at": datetime.now().isoformat(),
        }
        self._save()
    
    def get_file_info(self, filepath: str) -> Optional[dict]:
        """Get information about a file."""
        return self._knowledge["files"].get(filepath)
    
    def set_component_info(self, name: str, info: dict):
        """Record information about a component."""
        self._knowledge["components"][name] = {
            **info,
            "updated_at": datetime.now().isoformat(),
        }
        self._save()
    
    def get_component_info(self, name: str) -> Optional[dict]:
        """Get information about a component."""
        return self._knowledge["components"].get(name)
    
    def add_convention(self, convention: str, category: str = "general"):
        """Add a coding convention."""
        self._knowledge["conventions"].append({
            "text": convention,
            "category": category,
            "added_at": datetime.now().isoformat(),
        })
        self._save()
    
    def get_conventions(self, category: Optional[str] = None) -> list[dict]:
        """Get coding conventions."""
        if category:
            return [c for c in self._knowledge["conventions"] if c.get("category") == category]
        return self._knowledge["conventions"]
    
    def record_recurring_issue(self, issue_type: str, description: str, occurrences: int = 1):
        """Record a recurring issue pattern."""
        if issue_type not in self._knowledge["issues"]:
            self._knowledge["issues"][issue_type] = {
                "description": description,
                "occurrences": 0,
                "first_seen": datetime.now().isoformat(),
            }
        
        self._knowledge["issues"][issue_type]["occurrences"] += occurrences
        self._knowledge["issues"][issue_type]["last_seen"] = datetime.now().isoformat()
        self._save()
    
    def get_recurring_issues(self) -> dict:
        """Get all recurring issues sorted by frequency."""
        issues = list(self._knowledge["issues"].items())
        issues.sort(key=lambda x: x[1]["occurrences"], reverse=True)
        return dict(issues)
    
    def format_context(self) -> str:
        """Format knowledge as context for agents."""
        lines = ["# Codebase Knowledge\n"]
        
        # Conventions
        if self._knowledge["conventions"]:
            lines.append("## Coding Conventions")
            for conv in self._knowledge["conventions"][:10]:
                lines.append(f"- {conv['text']}")
            lines.append("")
        
        # Recurring issues
        if self._knowledge["issues"]:
            lines.append("## Known Recurring Issues")
            for issue_type, info in list(self._knowledge["issues"].items())[:5]:
                lines.append(f"- **{issue_type}** ({info['occurrences']} occurrences): {info['description']}")
            lines.append("")
        
        return "\n".join(lines)


# ============================================
# UNIFIED MEMORY INTERFACE
# ============================================

class MemorySystem:
    """
    Unified interface to all memory subsystems.
    Provides a single point of access for agents.
    """
    
    def __init__(self, base_path: Optional[Path] = None):
        self.base_path = base_path or Paths.MEMORY
        self.semantic = SemanticMemory(self.base_path)
        self.episodic = EpisodicMemoryStore(self.base_path)
        self.codebase = CodebaseKnowledge(self.base_path)
    
    def get_context_for_agent(self, agent_role: str) -> str:
        """Get all relevant context for an agent."""
        parts = []
        
        # Semantic memories
        semantic_context = self.semantic.get_context_for_agent(agent_role)
        if semantic_context:
            parts.append(semantic_context)
        
        # Successful patterns
        patterns = self.episodic.get_successful_patterns(limit=5)
        if patterns:
            parts.append(self.episodic.format_for_context(patterns))
        
        # Codebase knowledge
        codebase_context = self.codebase.format_context()
        if codebase_context:
            parts.append(codebase_context)
        
        return "\n\n".join(parts)
    
    def remember_finding(
        self,
        content: str,
        category: str,
        agent_role: str,
        source_file: str = "",
        tags: Optional[list[str]] = None,
    ):
        """Store a finding as a memory for future reference."""
        self.semantic.add(
            content=content,
            memory_type="observation",
            category=category,
            tags=tags or [category, agent_role],
            source_agent=agent_role,
            source_file=source_file,
        )
    
    def record_success(
        self,
        observation: str,
        reasoning: str,
        action: str,
        outcome: str,
        category: str = "general",
    ):
        """Record a successful action for future learning."""
        self.episodic.record(
            observation=observation,
            reasoning=reasoning,
            action=action,
            outcome=outcome,
            success=True,
            category=category,
        )
    
    def record_failure(
        self,
        observation: str,
        reasoning: str,
        action: str,
        outcome: str,
        category: str = "general",
    ):
        """Record a failed action to avoid in the future."""
        self.episodic.record(
            observation=observation,
            reasoning=reasoning,
            action=action,
            outcome=outcome,
            success=False,
            category=category,
        )
    
    def get_stats(self) -> dict:
        """Get statistics across all memory systems."""
        return {
            "semantic": self.semantic.get_stats(),
            "episodic": {
                "total_episodes": len(self.episodic._episodes),
                "successful": len([e for e in self.episodic._episodes if e.success]),
                "failed": len([e for e in self.episodic._episodes if not e.success]),
            },
            "codebase": {
                "files_tracked": len(self.codebase._knowledge.get("files", {})),
                "components_tracked": len(self.codebase._knowledge.get("components", {})),
                "conventions": len(self.codebase._knowledge.get("conventions", [])),
                "recurring_issues": len(self.codebase._knowledge.get("issues", {})),
            },
        }


# Global memory system
MEMORY_SYSTEM = MemorySystem()
