"""
Helm Intelligence - Core Agent Framework
The foundational agentic loop and base agent class.
"""

import json
import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncIterator, Callable, Optional
from uuid import uuid4
import anthropic
from enum import Enum

from config.settings import (
    AgentConfig, AgentRole, Models, Paths, Severity, Category
)


# ============================================
# MESSAGE TYPES
# ============================================

class MessageRole(Enum):
    USER = "user"
    ASSISTANT = "assistant"
    TOOL_USE = "tool_use"
    TOOL_RESULT = "tool_result"


@dataclass
class AgentMessage:
    """A message in the agent's conversation history."""
    role: MessageRole
    content: Any
    timestamp: datetime = field(default_factory=datetime.now)
    metadata: dict = field(default_factory=dict)
    
    def to_api_format(self) -> dict:
        """Convert to Anthropic API format."""
        if self.role == MessageRole.USER:
            return {"role": "user", "content": self.content}
        elif self.role == MessageRole.ASSISTANT:
            return {"role": "assistant", "content": self.content}
        return {"role": self.role.value, "content": self.content}


@dataclass
class Finding:
    """An issue or observation discovered during audit."""
    id: str = field(default_factory=lambda: uuid4().hex[:8])
    category: Category = Category.CODE_QUALITY
    severity: Severity = Severity.MEDIUM
    title: str = ""
    description: str = ""
    location: dict = field(default_factory=dict)  # file, line, component
    evidence: str = ""
    suggested_fix: str = ""
    automatable: bool = False
    agent_id: str = ""
    timestamp: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "category": self.category.value,
            "severity": self.severity.value,
            "title": self.title,
            "description": self.description,
            "location": self.location,
            "evidence": self.evidence,
            "suggested_fix": self.suggested_fix,
            "automatable": self.automatable,
            "agent_id": self.agent_id,
            "timestamp": self.timestamp.isoformat(),
        }


# ============================================
# TOOL DEFINITIONS
# ============================================

@dataclass
class Tool:
    """Definition of a tool the agent can use."""
    name: str
    description: str
    input_schema: dict
    handler: Callable[..., Any]


class ToolRegistry:
    """Registry of available tools."""
    
    def __init__(self):
        self._tools: dict[str, Tool] = {}
    
    def register(self, tool: Tool):
        """Register a tool."""
        self._tools[tool.name] = tool
    
    def get(self, name: str) -> Optional[Tool]:
        """Get a tool by name."""
        return self._tools.get(name)
    
    def get_definitions(self, tool_names: list[str]) -> list[dict]:
        """Get tool definitions in API format."""
        definitions = []
        for name in tool_names:
            if tool := self._tools.get(name):
                definitions.append({
                    "name": tool.name,
                    "description": tool.description,
                    "input_schema": tool.input_schema,
                })
        return definitions
    
    async def execute(self, name: str, inputs: dict) -> Any:
        """Execute a tool."""
        if tool := self._tools.get(name):
            if asyncio.iscoroutinefunction(tool.handler):
                return await tool.handler(**inputs)
            return tool.handler(**inputs)
        raise ValueError(f"Unknown tool: {name}")


# Global tool registry
TOOL_REGISTRY = ToolRegistry()


# ============================================
# BASE AGENT CLASS
# ============================================

class BaseAgent(ABC):
    """
    Base class for all agents in the Helm Intelligence system.
    Implements the core agentic loop with tool use.
    MAXIMUM CONTEXT MODE - Uses full 200K token window.
    """
    
    def __init__(
        self,
        config: AgentConfig,
        client: Optional[anthropic.Anthropic] = None,
    ):
        self.config = config
        self.client = client or anthropic.Anthropic()
        self.agent_id = f"{config.role.value}_{uuid4().hex[:8]}"
        self.messages: list[AgentMessage] = []
        self.findings: list[Finding] = []
        self.artifacts: dict[str, Any] = {}
        self._turn_count = 0
        self._total_input_tokens = 0
        self._total_output_tokens = 0
        self._thinking_tokens = 0
    
    @property
    def system_prompt(self) -> str:
        """Get the full system prompt - no truncation with 200K context."""
        return self.config.system_prompt
    
    def _estimate_tokens(self, text: str) -> int:
        """Rough token estimate (4 chars per token)."""
        return len(text) // 4
    
    def _get_context_usage(self) -> dict:
        """Track context window usage."""
        system_tokens = self._estimate_tokens(self.system_prompt)
        message_tokens = sum(
            self._estimate_tokens(str(m.content)) for m in self.messages
        )
        return {
            "system": system_tokens,
            "messages": message_tokens,
            "total": system_tokens + message_tokens,
            "remaining": Models.MAX_CONTEXT - (system_tokens + message_tokens),
            "utilization": (system_tokens + message_tokens) / Models.MAX_CONTEXT
        }
    
    @abstractmethod
    async def execute_task(self, task: str, context: dict) -> dict:
        """Execute the agent's primary task. Implemented by subclasses."""
        pass
    
    async def run(
        self,
        initial_prompt: str,
        context: Optional[dict] = None,
        max_turns: Optional[int] = None,
    ) -> AsyncIterator[dict]:
        """
        Run the agentic loop until completion or max turns.
        
        This is the core loop:
        1. Send message to Claude
        2. Process response (text, tool calls, thinking)
        3. Execute any tool calls
        4. Feed results back
        5. Repeat until done or max turns
        """
        max_turns = max_turns or self.config.max_turns
        
        # Initialize conversation
        self.messages.append(AgentMessage(
            role=MessageRole.USER,
            content=self._build_initial_prompt(initial_prompt, context or {})
        ))
        
        while self._turn_count < max_turns:
            self._turn_count += 1
            
            # Get response from Claude
            response = await self._call_api()
            
            # Track tokens
            self._total_input_tokens += response.usage.input_tokens
            self._total_output_tokens += response.usage.output_tokens
            
            # Process response blocks
            assistant_content = []
            tool_calls = []
            
            for block in response.content:
                if block.type == "thinking":
                    self._thinking_tokens += getattr(block, 'thinking_tokens', 0)
                    yield {"type": "thinking", "content": block.thinking}
                
                elif block.type == "text":
                    assistant_content.append(block)
                    yield {"type": "text", "content": block.text}
                
                elif block.type == "tool_use":
                    assistant_content.append(block)
                    tool_calls.append(block)
                    yield {"type": "tool_call", "tool": block.name, "input": block.input}
            
            # Save assistant message
            self.messages.append(AgentMessage(
                role=MessageRole.ASSISTANT,
                content=assistant_content
            ))
            
            # Check if we're done (no tool calls and stop reason is end_turn)
            if response.stop_reason == "end_turn" and not tool_calls:
                yield {"type": "complete", "reason": "task_complete"}
                break
            
            # Execute tool calls and feed results back
            if tool_calls:
                tool_results = []
                for tool_call in tool_calls:
                    try:
                        result = await TOOL_REGISTRY.execute(
                            tool_call.name,
                            tool_call.input
                        )
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": tool_call.id,
                            "content": self._format_tool_result(result)
                        })
                        yield {"type": "tool_result", "tool": tool_call.name, "result": result}
                    except Exception as e:
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": tool_call.id,
                            "content": f"Error: {str(e)}",
                            "is_error": True
                        })
                        yield {"type": "tool_error", "tool": tool_call.name, "error": str(e)}
                
                # Add tool results as user message
                self.messages.append(AgentMessage(
                    role=MessageRole.USER,
                    content=tool_results
                ))
        
        else:
            yield {"type": "complete", "reason": "max_turns_reached"}
    
    async def _call_api(self) -> anthropic.types.Message:
        """Make an API call to Claude."""
        # Build messages in API format
        api_messages = [m.to_api_format() for m in self.messages]
        
        # Build system prompt with caching
        system = [{
            "type": "text",
            "text": self.system_prompt,
            "cache_control": {"type": "ephemeral"} if self.config.cache_system_prompt else None
        }]
        
        # Get tool definitions
        tools = TOOL_REGISTRY.get_definitions(self.config.tools) if self.config.tools else None
        
        # Make the call
        kwargs = {
            "model": self.config.model,
            "max_tokens": 16384,
            "system": system,
            "messages": api_messages,
            "temperature": self.config.temperature,
        }
        
        if tools:
            kwargs["tools"] = tools
        
        # Extended thinking disabled for API compatibility
        # (requires temperature=1 which conflicts with deterministic outputs)
        
        return self.client.messages.create(**kwargs)
    
    def _build_initial_prompt(self, task: str, context: dict) -> str:
        """Build the initial prompt with context."""
        prompt = f"# Task\n{task}\n"
        
        if context:
            prompt += "\n# Context\n"
            for key, value in context.items():
                if isinstance(value, (dict, list)):
                    prompt += f"\n## {key}\n```json\n{json.dumps(value, indent=2)}\n```\n"
                else:
                    prompt += f"\n## {key}\n{value}\n"
        
        return prompt
    
    def _format_tool_result(self, result: Any) -> str:
        """Format a tool result for the API."""
        if isinstance(result, str):
            return result
        return json.dumps(result, indent=2, default=str)
    
    def add_finding(self, finding: Finding):
        """Add a finding from this agent."""
        finding.agent_id = self.agent_id
        self.findings.append(finding)
    
    def store_artifact(self, key: str, value: Any):
        """Store an artifact for later retrieval."""
        self.artifacts[key] = value
    
    def get_stats(self) -> dict:
        """Get agent statistics."""
        return {
            "agent_id": self.agent_id,
            "role": self.config.role.value,
            "turns": self._turn_count,
            "input_tokens": self._total_input_tokens,
            "output_tokens": self._total_output_tokens,
            "thinking_tokens": self._thinking_tokens,
            "findings_count": len(self.findings),
            "estimated_cost": self._estimate_cost(),
        }
    
    def _estimate_cost(self) -> float:
        """Estimate the cost of this agent's API usage."""
        costs = Models.COSTS.get(self.config.model, {"input": 0, "output": 0})
        input_cost = (self._total_input_tokens / 1_000_000) * costs["input"]
        output_cost = (self._total_output_tokens / 1_000_000) * costs["output"]
        return round(input_cost + output_cost, 4)


# ============================================
# ARTIFACT STORAGE
# ============================================

class ArtifactStore:
    """
    External storage for agent artifacts.
    Prevents context window pollution while enabling inter-agent communication.
    """
    
    def __init__(self, base_path: Optional[Path] = None):
        self.base_path = base_path or Paths.ARTIFACTS
        self.base_path.mkdir(parents=True, exist_ok=True)
        self._index: dict[str, dict] = {}
    
    def store(self, agent_id: str, key: str, data: Any) -> str:
        """Store an artifact and return a reference."""
        ref = f"{agent_id}_{key}_{uuid4().hex[:8]}"
        filepath = self.base_path / f"{ref}.json"
        
        with open(filepath, 'w') as f:
            json.dump({
                "ref": ref,
                "agent_id": agent_id,
                "key": key,
                "data": data,
                "timestamp": datetime.now().isoformat(),
            }, f, indent=2, default=str)
        
        self._index[ref] = {
            "filepath": str(filepath),
            "agent_id": agent_id,
            "key": key,
            "timestamp": datetime.now().isoformat(),
        }
        
        return ref
    
    def retrieve(self, ref: str) -> Any:
        """Retrieve an artifact by reference."""
        if ref not in self._index:
            # Try to find the file
            filepath = self.base_path / f"{ref}.json"
            if not filepath.exists():
                raise ValueError(f"Artifact not found: {ref}")
        else:
            filepath = Path(self._index[ref]["filepath"])
        
        with open(filepath) as f:
            return json.load(f)["data"]
    
    def list_artifacts(self, agent_id: Optional[str] = None) -> list[dict]:
        """List all artifacts, optionally filtered by agent."""
        artifacts = []
        for ref, info in self._index.items():
            if agent_id is None or info["agent_id"] == agent_id:
                artifacts.append({"ref": ref, **info})
        return artifacts
    
    def get_summary(self, ref: str) -> str:
        """Get a brief summary of an artifact (for context windows)."""
        data = self.retrieve(ref)
        if isinstance(data, dict):
            return f"Artifact {ref}: {len(data)} keys, {list(data.keys())[:5]}..."
        elif isinstance(data, list):
            return f"Artifact {ref}: {len(data)} items"
        return f"Artifact {ref}: {type(data).__name__}"


# Global artifact store
ARTIFACT_STORE = ArtifactStore()


# ============================================
# CHECKPOINT SYSTEM
# ============================================

@dataclass
class Checkpoint:
    """A saved state of an agent or workflow."""
    checkpoint_id: str
    agent_id: str
    timestamp: datetime
    phase: str
    messages: list[dict]
    findings: list[dict]
    artifacts: dict[str, str]  # artifact refs
    metadata: dict
    
    def to_dict(self) -> dict:
        return {
            "checkpoint_id": self.checkpoint_id,
            "agent_id": self.agent_id,
            "timestamp": self.timestamp.isoformat(),
            "phase": self.phase,
            "messages": self.messages,
            "findings": self.findings,
            "artifacts": self.artifacts,
            "metadata": self.metadata,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "Checkpoint":
        return cls(
            checkpoint_id=data["checkpoint_id"],
            agent_id=data["agent_id"],
            timestamp=datetime.fromisoformat(data["timestamp"]),
            phase=data["phase"],
            messages=data["messages"],
            findings=data["findings"],
            artifacts=data["artifacts"],
            metadata=data["metadata"],
        )


class CheckpointManager:
    """Manages checkpoints for recovery and resumption."""
    
    def __init__(self, base_path: Optional[Path] = None):
        self.base_path = base_path or Paths.CHECKPOINTS
        self.base_path.mkdir(parents=True, exist_ok=True)
    
    def save(self, agent: BaseAgent, phase: str, metadata: Optional[dict] = None) -> str:
        """Save a checkpoint for an agent."""
        checkpoint = Checkpoint(
            checkpoint_id=f"cp_{uuid4().hex[:12]}",
            agent_id=agent.agent_id,
            timestamp=datetime.now(),
            phase=phase,
            messages=[m.to_api_format() for m in agent.messages],
            findings=[f.to_dict() for f in agent.findings],
            artifacts=agent.artifacts,
            metadata=metadata or {},
        )
        
        filepath = self.base_path / f"{checkpoint.checkpoint_id}.json"
        with open(filepath, 'w') as f:
            json.dump(checkpoint.to_dict(), f, indent=2)
        
        return checkpoint.checkpoint_id
    
    def load(self, checkpoint_id: str) -> Checkpoint:
        """Load a checkpoint."""
        filepath = self.base_path / f"{checkpoint_id}.json"
        with open(filepath) as f:
            return Checkpoint.from_dict(json.load(f))
    
    def get_latest(self, agent_id: str) -> Optional[Checkpoint]:
        """Get the latest checkpoint for an agent."""
        checkpoints = []
        for filepath in self.base_path.glob("*.json"):
            with open(filepath) as f:
                data = json.load(f)
                if data["agent_id"] == agent_id:
                    checkpoints.append(Checkpoint.from_dict(data))
        
        if not checkpoints:
            return None
        
        return max(checkpoints, key=lambda c: c.timestamp)
    
    def list_checkpoints(self) -> list[dict]:
        """List all available checkpoints."""
        checkpoints = []
        for filepath in self.base_path.glob("*.json"):
            with open(filepath) as f:
                data = json.load(f)
                checkpoints.append({
                    "checkpoint_id": data["checkpoint_id"],
                    "agent_id": data["agent_id"],
                    "phase": data["phase"],
                    "timestamp": data["timestamp"],
                })
        return sorted(checkpoints, key=lambda c: c["timestamp"], reverse=True)


# Global checkpoint manager
CHECKPOINT_MANAGER = CheckpointManager()
