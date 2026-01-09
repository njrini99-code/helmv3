"""
Helm Intelligence - Memory System
Persistent memory for learning across audit sessions.
Implements semantic + episodic memory patterns.
"""

import json
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional, Any
from uuid import uuid4
import hashlib

from config.settings import Paths


# ============================================
# MEMORY TYPES
# ============================================

@dataclass
class SemanticMemory:
    """
    Long-term factual knowledge about the codebase.
    Persists across sessions.
    """
    id: str = field(default_factory=lambda: uuid4().hex[:12])
    category: str = ""  # code_pattern, db_schema, ui_component, etc.
    key: str = ""       # Unique identifier for lookup
    content: str = ""   # The actual knowledge
    confidence: float = 1.0  # How certain we are (0-1)
    source: str = ""    # Where this came from
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    access_count: int = 0
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "category": self.category,
            "key": self.key,
            "content": self.content,
            "confidence": self.confidence,
            "source": self.source,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "access_count": self.access_count,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "SemanticMemory":
        return cls(
            id=data["id"],
            category=data["category"],
            key=data["key"],
            content=data["content"],
            confidence=data.get("confidence", 1.0),
            source=data.get("source", ""),
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
            access_count=data.get("access_count", 0),
        )


@dataclass
class EpisodicMemory:
    """
    Memory of specific audit events and their outcomes.
    Used for learning from past experiences.
    """
    id: str = field(default_factory=lambda: uuid4().hex[:12])
    episode_type: str = ""  # fix_applied, pattern_detected, error_encountered
    observation: str = ""   # What the agent observed
    reasoning: str = ""     # How it analyzed the situation
    action: str = ""        # What was done
    outcome: str = ""       # Result (success, failure, partial)
    context: dict = field(default_factory=dict)  # Additional context
    workflow_id: str = ""
    agent_id: str = ""
    timestamp: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "episode_type": self.episode_type,
            "observation": self.observation,
            "reasoning": self.reasoning,
            "action": self.action,
            "outcome": self.outcome,
            "context": self.context,
            "workflow_id": self.workflow_id,
            "agent_id": self.agent_id,
            "timestamp": self.timestamp.isoformat(),
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "EpisodicMemory":
        return cls(
            id=data["id"],
            episode_type=data["episode_type"],
            observation=data["observation"],
            reasoning=data["reasoning"],
            action=data["action"],
            outcome=data["outcome"],
            context=data.get("context", {}),
            workflow_id=data.get("workflow_id", ""),
            agent_id=data.get("agent_id", ""),
            timestamp=datetime.fromisoformat(data["timestamp"]),
        )


@dataclass
class WorkingMemory:
    """
    Short-term memory for current audit session.
    Cleared between sessions.
    """
    session_id: str = field(default_factory=lambda: uuid4().hex[:12])
    started_at: datetime = field(default_factory=datetime.now)
    
    # Current focus
    current_file: Optional[str] = None
    current_task: Optional[str] = None
    
    # Accumulated context
    files_analyzed: list[str] = field(default_factory=list)
    findings_so_far: list[dict] = field(default_factory=list)
    decisions_made: list[dict] = field(default_factory=list)
    
    # Scratchpad for reasoning
    scratchpad: dict = field(default_factory=dict)
    
    def add_file(self, filepath: str):
        if filepath not in self.files_analyzed:
            self.files_analyzed.append(filepath)
    
    def add_finding(self, finding: dict):
        self.findings_so_far.append(finding)
    
    def add_decision(self, decision: str, reasoning: str):
        self.decisions_made.append({
            "decision": decision,
            "reasoning": reasoning,
            "timestamp": datetime.now().isoformat(),
        })
    
    def to_context_string(self, max_length: int = 4000) -> str:
        """Convert working memory to a context string for prompts."""
        context = f"""# Current Session Context

## Files Analyzed ({len(self.files_analyzed)})
{', '.join(self.files_analyzed[-10:])}{'...' if len(self.files_analyzed) > 10 else ''}

## Findings So Far ({len(self.findings_so_far)})
"""
        for f in self.findings_so_far[-5:]:
            context += f"- [{f.get('severity', 'unknown')}] {f.get('title', 'Untitled')}\n"
        
        context += f"""
## Recent Decisions
"""
        for d in self.decisions_made[-3:]:
            context += f"- {d['decision']}\n"
        
        return context[:max_length]


# ============================================
# MEMORY STORE
# ============================================

class MemoryStore:
    """
    SQLite-backed persistent memory store.
    Supports semantic and episodic memory with search.
    """
    
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or Paths.MEMORY / "helm_memory.db"
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
    
    def _init_db(self):
        """Initialize the database schema."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Semantic memory table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS semantic_memory (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                key TEXT NOT NULL,
                content TEXT NOT NULL,
                confidence REAL DEFAULT 1.0,
                source TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                access_count INTEGER DEFAULT 0,
                content_hash TEXT,
                UNIQUE(category, key)
            )
        """)
        
        # Episodic memory table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS episodic_memory (
                id TEXT PRIMARY KEY,
                episode_type TEXT NOT NULL,
                observation TEXT NOT NULL,
                reasoning TEXT,
                action TEXT,
                outcome TEXT,
                context TEXT,
                workflow_id TEXT,
                agent_id TEXT,
                timestamp TEXT NOT NULL
            )
        """)
        
        # Indexes for faster lookup
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_semantic_category ON semantic_memory(category)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_semantic_key ON semantic_memory(key)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_episodic_type ON episodic_memory(episode_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_episodic_outcome ON episodic_memory(outcome)")
        
        conn.commit()
        conn.close()
    
    # ==========================================
    # SEMANTIC MEMORY OPERATIONS
    # ==========================================
    
    def store_semantic(self, memory: SemanticMemory) -> str:
        """Store or update semantic memory."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        content_hash = hashlib.md5(memory.content.encode()).hexdigest()
        
        cursor.execute("""
            INSERT INTO semantic_memory 
            (id, category, key, content, confidence, source, created_at, updated_at, access_count, content_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(category, key) DO UPDATE SET
                content = excluded.content,
                confidence = excluded.confidence,
                source = excluded.source,
                updated_at = excluded.updated_at,
                content_hash = excluded.content_hash
        """, (
            memory.id, memory.category, memory.key, memory.content,
            memory.confidence, memory.source,
            memory.created_at.isoformat(), memory.updated_at.isoformat(),
            memory.access_count, content_hash
        ))
        
        conn.commit()
        conn.close()
        return memory.id
    
    def get_semantic(self, category: str, key: str) -> Optional[SemanticMemory]:
        """Retrieve semantic memory by category and key."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM semantic_memory WHERE category = ? AND key = ?
        """, (category, key))
        
        row = cursor.fetchone()
        if row:
            # Update access count
            cursor.execute("""
                UPDATE semantic_memory 
                SET access_count = access_count + 1 
                WHERE category = ? AND key = ?
            """, (category, key))
            conn.commit()
            
            memory = SemanticMemory(
                id=row[0], category=row[1], key=row[2], content=row[3],
                confidence=row[4], source=row[5],
                created_at=datetime.fromisoformat(row[6]),
                updated_at=datetime.fromisoformat(row[7]),
                access_count=row[8] + 1
            )
            conn.close()
            return memory
        
        conn.close()
        return None
    
    def search_semantic(
        self, 
        query: str, 
        category: Optional[str] = None,
        limit: int = 10
    ) -> list[SemanticMemory]:
        """Search semantic memory by content (simple text search)."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        if category:
            cursor.execute("""
                SELECT * FROM semantic_memory 
                WHERE category = ? AND content LIKE ?
                ORDER BY access_count DESC, confidence DESC
                LIMIT ?
            """, (category, f"%{query}%", limit))
        else:
            cursor.execute("""
                SELECT * FROM semantic_memory 
                WHERE content LIKE ? OR key LIKE ?
                ORDER BY access_count DESC, confidence DESC
                LIMIT ?
            """, (f"%{query}%", f"%{query}%", limit))
        
        results = []
        for row in cursor.fetchall():
            results.append(SemanticMemory(
                id=row[0], category=row[1], key=row[2], content=row[3],
                confidence=row[4], source=row[5],
                created_at=datetime.fromisoformat(row[6]),
                updated_at=datetime.fromisoformat(row[7]),
                access_count=row[8]
            ))
        
        conn.close()
        return results
    
    def list_semantic_by_category(self, category: str) -> list[SemanticMemory]:
        """List all semantic memories in a category."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM semantic_memory 
            WHERE category = ?
            ORDER BY updated_at DESC
        """, (category,))
        
        results = []
        for row in cursor.fetchall():
            results.append(SemanticMemory(
                id=row[0], category=row[1], key=row[2], content=row[3],
                confidence=row[4], source=row[5],
                created_at=datetime.fromisoformat(row[6]),
                updated_at=datetime.fromisoformat(row[7]),
                access_count=row[8]
            ))
        
        conn.close()
        return results
    
    # ==========================================
    # EPISODIC MEMORY OPERATIONS
    # ==========================================
    
    def store_episodic(self, memory: EpisodicMemory) -> str:
        """Store an episodic memory."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO episodic_memory 
            (id, episode_type, observation, reasoning, action, outcome, context, workflow_id, agent_id, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            memory.id, memory.episode_type, memory.observation,
            memory.reasoning, memory.action, memory.outcome,
            json.dumps(memory.context), memory.workflow_id,
            memory.agent_id, memory.timestamp.isoformat()
        ))
        
        conn.commit()
        conn.close()
        return memory.id
    
    def get_similar_episodes(
        self, 
        observation: str, 
        episode_type: Optional[str] = None,
        limit: int = 5
    ) -> list[EpisodicMemory]:
        """Find similar past episodes for learning."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        if episode_type:
            cursor.execute("""
                SELECT * FROM episodic_memory 
                WHERE episode_type = ? AND observation LIKE ?
                ORDER BY timestamp DESC
                LIMIT ?
            """, (episode_type, f"%{observation[:50]}%", limit))
        else:
            cursor.execute("""
                SELECT * FROM episodic_memory 
                WHERE observation LIKE ?
                ORDER BY timestamp DESC
                LIMIT ?
            """, (f"%{observation[:50]}%", limit))
        
        results = []
        for row in cursor.fetchall():
            results.append(EpisodicMemory(
                id=row[0], episode_type=row[1], observation=row[2],
                reasoning=row[3], action=row[4], outcome=row[5],
                context=json.loads(row[6]) if row[6] else {},
                workflow_id=row[7], agent_id=row[8],
                timestamp=datetime.fromisoformat(row[9])
            ))
        
        conn.close()
        return results
    
    def get_successful_fixes(self, pattern: str, limit: int = 5) -> list[EpisodicMemory]:
        """Get successful fix episodes matching a pattern."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM episodic_memory 
            WHERE episode_type = 'fix_applied' 
            AND outcome = 'success'
            AND (observation LIKE ? OR action LIKE ?)
            ORDER BY timestamp DESC
            LIMIT ?
        """, (f"%{pattern}%", f"%{pattern}%", limit))
        
        results = []
        for row in cursor.fetchall():
            results.append(EpisodicMemory(
                id=row[0], episode_type=row[1], observation=row[2],
                reasoning=row[3], action=row[4], outcome=row[5],
                context=json.loads(row[6]) if row[6] else {},
                workflow_id=row[7], agent_id=row[8],
                timestamp=datetime.fromisoformat(row[9])
            ))
        
        conn.close()
        return results
    
    def get_failed_attempts(self, pattern: str, limit: int = 5) -> list[EpisodicMemory]:
        """Get failed episodes to learn from mistakes."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM episodic_memory 
            WHERE outcome IN ('failure', 'error')
            AND (observation LIKE ? OR action LIKE ?)
            ORDER BY timestamp DESC
            LIMIT ?
        """, (f"%{pattern}%", f"%{pattern}%", limit))
        
        results = []
        for row in cursor.fetchall():
            results.append(EpisodicMemory(
                id=row[0], episode_type=row[1], observation=row[2],
                reasoning=row[3], action=row[4], outcome=row[5],
                context=json.loads(row[6]) if row[6] else {},
                workflow_id=row[7], agent_id=row[8],
                timestamp=datetime.fromisoformat(row[9])
            ))
        
        conn.close()
        return results
    
    # ==========================================
    # CODEBASE KNOWLEDGE
    # ==========================================
    
    def remember_file_pattern(self, filepath: str, pattern: str, description: str):
        """Remember a pattern observed in a file."""
        self.store_semantic(SemanticMemory(
            category="code_pattern",
            key=f"{filepath}:{pattern}",
            content=description,
            source=filepath,
        ))
    
    def remember_table_schema(self, table: str, schema: dict):
        """Remember database table schema."""
        self.store_semantic(SemanticMemory(
            category="db_schema",
            key=table,
            content=json.dumps(schema),
            source="database",
        ))
    
    def remember_component_structure(self, component: str, structure: dict):
        """Remember UI component structure."""
        self.store_semantic(SemanticMemory(
            category="ui_component",
            key=component,
            content=json.dumps(structure),
            source="codebase",
        ))
    
    def remember_fix(
        self, 
        problem: str, 
        solution: str, 
        outcome: str,
        context: dict
    ):
        """Remember a fix attempt for future learning."""
        self.store_episodic(EpisodicMemory(
            episode_type="fix_applied",
            observation=problem,
            reasoning=context.get("reasoning", ""),
            action=solution,
            outcome=outcome,
            context=context,
        ))
    
    def get_relevant_context(self, task: str, limit: int = 10) -> str:
        """Get relevant memories for a task as context string."""
        context_parts = []
        
        # Search semantic memories
        semantic = self.search_semantic(task, limit=limit // 2)
        if semantic:
            context_parts.append("## Relevant Knowledge")
            for mem in semantic:
                context_parts.append(f"- [{mem.category}] {mem.key}: {mem.content[:200]}")
        
        # Search episodic memories
        episodic = self.get_similar_episodes(task, limit=limit // 2)
        if episodic:
            context_parts.append("\n## Similar Past Experiences")
            for ep in episodic:
                context_parts.append(
                    f"- {ep.episode_type}: {ep.observation[:100]}... → {ep.outcome}"
                )
        
        return "\n".join(context_parts) if context_parts else ""
    
    # ==========================================
    # STATISTICS
    # ==========================================
    
    def get_stats(self) -> dict:
        """Get memory statistics."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM semantic_memory")
        semantic_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM episodic_memory")
        episodic_count = cursor.fetchone()[0]
        
        cursor.execute("""
            SELECT category, COUNT(*) 
            FROM semantic_memory 
            GROUP BY category
        """)
        semantic_by_category = dict(cursor.fetchall())
        
        cursor.execute("""
            SELECT outcome, COUNT(*) 
            FROM episodic_memory 
            GROUP BY outcome
        """)
        episodic_by_outcome = dict(cursor.fetchall())
        
        conn.close()
        
        return {
            "semantic_memories": semantic_count,
            "episodic_memories": episodic_count,
            "semantic_by_category": semantic_by_category,
            "episodic_by_outcome": episodic_by_outcome,
        }


# ============================================
# GLOBAL MEMORY INSTANCE
# ============================================

MEMORY = MemoryStore()


# ============================================
# HELPER FUNCTIONS
# ============================================

def learn_from_audit(findings: list[dict], workflow_id: str):
    """Learn patterns from audit findings."""
    for finding in findings:
        # Store the pattern
        MEMORY.store_semantic(SemanticMemory(
            category="audit_finding",
            key=f"{finding.get('category', 'unknown')}:{finding.get('title', 'untitled')[:50]}",
            content=json.dumps(finding),
            source=finding.get("location", {}).get("file", "unknown"),
        ))


def get_past_fixes_for_issue(issue_type: str) -> list[dict]:
    """Get successful fixes for similar issues."""
    episodes = MEMORY.get_successful_fixes(issue_type)
    return [
        {
            "problem": ep.observation,
            "solution": ep.action,
            "context": ep.context,
        }
        for ep in episodes
    ]


def remember_decision(decision: str, reasoning: str, outcome: str, context: dict):
    """Remember a decision made during audit."""
    MEMORY.store_episodic(EpisodicMemory(
        episode_type="decision",
        observation=context.get("situation", ""),
        reasoning=reasoning,
        action=decision,
        outcome=outcome,
        context=context,
    ))
