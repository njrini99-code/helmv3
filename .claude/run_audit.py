#!/usr/bin/env python3
"""
Production Audit Command Runner for Claude Code
Execute specialized agents with memory inside Claude Code/Cursor
"""

import json
import sys
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).parent.parent
CLAUDE_DIR = PROJECT_ROOT / ".claude"
PRODUCTION_DIR = PROJECT_ROOT / ".production-team"

def load_config():
    """Load commands configuration."""
    config_file = CLAUDE_DIR / "commands.json"
    with open(config_file, 'r') as f:
        return json.load(f)

def load_agent_memory(memory_file):
    """Load agent memory if exists."""
    if memory_file.exists():
        with open(memory_file, 'r') as f:
            return json.load(f)
    return None

def generate_agent_prompt(agent_config, platform_config, memory_data, round_num=1):
    """Generate complete agent prompt with personality + memory + scope."""
    
    # Load agent personality
    personality_file = PROJECT_ROOT / agent_config['personality_file']
    with open(personality_file, 'r') as f:
        personality = f.read()
    
    # Load agent prompt/methodology
    prompt_file = PROJECT_ROOT / agent_config['prompt_file']
    with open(prompt_file, 'r') as f:
        methodology = f.read()
    
    # Build memory context
    memory_context = ""
    if memory_data:
        total_rounds = memory_data.get('total_rounds', 0)
        resolved = len(memory_data.get('known_issues_resolved', []))
        open_issues = memory_data.get('known_issues_open', [])
        
        memory_context = f"""
## 🧠 YOUR MEMORY FROM {total_rounds} PREVIOUS ROUNDS

You've audited this codebase {total_rounds} times before.

**Issues Resolved:** {resolved}
**Issues Still Open:** {len(open_issues)}

### Don't Re-Report (Already Fixed):
"""
        for issue in memory_data.get('known_issues_resolved', [])[-10:]:
            memory_context += f"- {issue['issue']} (fixed in Round {issue['round_resolved']})\n"
        
        memory_context += "\n### Focus on These Open Issues:\n"
        for issue in open_issues[:10]:
            memory_context += f"- [{issue['severity']}] {issue['issue']} (Round {issue['round_found']})\n"
    else:
        memory_context = "## 🧠 FIRST AUDIT\n\nThis is your first audit. Establish baseline findings."
    
    # Build platform scope
    platform_scope = f"""
## 🎯 PLATFORM SCOPE: {platform_config['name']} ONLY

**Database Tables:** WHERE table_name LIKE '{platform_config['tables']}'
**Routes:** {platform_config['routes']}
**Components:** {platform_config['components']}
**Features:** {', '.join(platform_config['features'])}

**CRITICAL:** Only audit {platform_config['name']}. Completely ignore other platforms.
"""
    
    # Combine everything
    full_prompt = f"""
{agent_config['emoji']} {agent_config['name'].upper()} - Round {round_num:02d}

{memory_context}

{platform_scope}

═══════════════════════════════════════════════════════════

{personality}

═══════════════════════════════════════════════════════════

{methodology}

═══════════════════════════════════════════════════════════

## 📊 OUTPUT

Save your findings to: {{output_dir}}/{agent_config['output_file']}

Update your memory at: {agent_config['memory_file']}

"""
    
    return full_prompt

def run_command(command_name, round_num=1):
    """Execute a command by loading all agents and generating prompts."""
    
    config = load_config()
    
    # Find the command
    command = None
    for cmd in config['commands']:
        if cmd['name'] == command_name:
            command = cmd
            break
    
    if not command:
        print(f"❌ Command '{command_name}' not found")
        print(f"Available commands: {', '.join([c['name'] for c in config['commands']])}")
        return
    
    platform_config = config['platform_scopes'][command['platform']]
    output_dir = PROJECT_ROOT / command['output_dir']
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"\n{'='*70}")
    print(f"🎭 PRODUCTION AUDIT - {platform_config['name'].upper()} - ROUND {round_num:02d}")
    print(f"{'='*70}\n")
    print(f"📁 Output: {output_dir}\n")
    
    # Generate prompts for each agent
    for agent_id in command['agents']:
        agent_config = config['agents'][agent_id]
        memory_file = PROJECT_ROOT / agent_config['memory_file']
        memory_data = load_agent_memory(memory_file)
        
        print(f"\n{agent_config['emoji']} {agent_config['name'].upper()}")
        print("─" * 70)
        
        # Generate full prompt
        prompt = generate_agent_prompt(
            agent_config, 
            platform_config, 
            memory_data,
            round_num
        )
        
        # Save prompt to file for Claude Code to execute
        prompt_output = output_dir / f"PROMPT_{agent_config['name'].replace(' ', '_').upper()}.md"
        with open(prompt_output, 'w') as f:
            f.write(prompt.replace('{output_dir}', str(output_dir)))
        
        print(f"✅ Generated prompt: {prompt_output}")
        print(f"   Memory loaded: {'Yes' if memory_data else 'No (first run)'}")
        print(f"   Platform scope: {platform_config['name']}")
    
    # Generate executor script
    executor_file = output_dir / "RUN_IN_CLAUDE_CODE.md"
    with open(executor_file, 'w') as f:
        f.write(f"""# 🚀 Execute This Audit in Claude Code

**Platform:** {platform_config['name']}
**Round:** {round_num:02d}
**Agents:** {len(command['agents'])}

## Copy/Paste This Into Claude Code:

```
I need to execute a {platform_config['name']} production audit with {len(command['agents'])} specialized agents.

AGENTS TO RUN:
""")
        
        for i, agent_id in enumerate(command['agents'], 1):
            agent_config = config['agents'][agent_id]
            f.write(f"""
{i}. {agent_config['emoji']} {agent_config['name']}
   - Load full prompt from: {output_dir}/PROMPT_{agent_config['name'].replace(' ', '_').upper()}.md
   - Execute the audit following all instructions
   - Save findings to: {output_dir}/{agent_config['output_file']}
   - Update memory at: {agent_config['memory_file']}
""")
        
        f.write(f"""
EXECUTION STEPS:

1. For each agent, read their PROMPT file above
2. Execute the audit exactly as instructed
3. Use Supabase MCP for database queries
4. Save findings in markdown format
5. Update agent memory JSON

Work autonomously through all {len(command['agents'])} agents.

After all agents complete, generate:
- {output_dir}/04_CROSS_AGENT_SYNTHESIS.md
- {output_dir}/05_PRIORITY_ACTION_ITEMS.md
```

## Then Open Claude Code and Paste Above Message

That's it! Claude Code will run all {len(command['agents'])} agents with full intelligence and memory.
""")
    
    print(f"\n{'='*70}")
    print(f"✨ PROMPTS GENERATED!")
    print(f"{'='*70}\n")
    print(f"📄 Next: Open and copy: {executor_file}")
    print(f"📋 Paste into Claude Code")
    print(f"🚀 Agents will execute with full intelligence + memory\n")

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 .claude/run_audit.py <command> [round_number]")
        print("\nAvailable commands:")
        config = load_config()
        for cmd in config['commands']:
            print(f"  - {cmd['name']}: {cmd['description']}")
        return
    
    command_name = sys.argv[1]
    round_num = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    
    run_command(command_name, round_num)

if __name__ == "__main__":
    main()
