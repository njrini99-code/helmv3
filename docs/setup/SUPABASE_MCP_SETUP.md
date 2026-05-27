# Supabase MCP Setup Guide

This guide will help you configure Claude to access your Supabase project directly through the Model Context Protocol (MCP).

## Your Supabase Project Details

- **Project Reference**: `qmnssrrolpinvwjjnufo`
- **Project URL**: `https://qmnssrrolpinvwjjnufo.supabase.co`

## Setup Steps

### 1. Configure MCP Server in Cursor

Cursor uses an MCP configuration file. Create or update `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "supabase": {
      "url": "https://mcp.supabase.com/mcp",
      "args": {
        "project_ref": "qmnssrrolpinvwjjnufo"
      }
    }
  }
}
```

**Note**: The exact configuration format may vary depending on your Cursor version. Some versions use:
- `.cursor/mcp.json` (JSON format)
- Or MCP settings through Cursor's Settings UI

### 2. Authenticate with Supabase

You'll need to authenticate with your Supabase account:

#### Option A: OAuth Authentication (Recommended)
1. When you first use the MCP tools, Cursor may prompt you to authenticate
2. A browser window will open asking you to log in to Supabase
3. Grant access to the MCP client
4. You'll be redirected back to Cursor

#### Option B: Personal Access Token (PAT)
If OAuth doesn't work, you can use a Personal Access Token:

1. **Generate a PAT**:
   - Go to https://supabase.com/dashboard/account/tokens
   - Click "Generate New Token"
   - Give it a descriptive name (e.g., "Cursor MCP Access")
   - Copy the token (you won't see it again!)

2. **Add to MCP Configuration**:
   ```json
   {
     "mcpServers": {
       "supabase": {
         "url": "https://mcp.supabase.com/mcp",
         "args": {
           "project_ref": "qmnssrrolpinvwjjnufo",
           "access_token": "your-pat-token-here"
         }
       }
     }
   }
   ```

   **⚠️ Security Note**: If using PAT, ensure `.cursor/mcp.json` is in your `.gitignore` to prevent committing tokens.

### 3. Verify Configuration

After configuration, you can test the connection by asking Claude to:
- List your Supabase tables
- Query your database
- Check your migrations
- View logs

Example prompts:
- "List all tables in my Supabase database"
- "Show me the schema for the players table"
- "What migrations are in my database?"

## Available MCP Tools

Once configured, Claude will have access to these Supabase MCP tools:

### Database Operations
- `mcp_supabase_execute_sql` - Execute raw SQL queries
- `mcp_supabase_apply_migration` - Apply database migrations
- `mcp_supabase_list_tables` - List all tables
- `mcp_supabase_list_extensions` - List database extensions
- `mcp_supabase_list_migrations` - List applied migrations

### Type Generation
- `mcp_supabase_generate_typescript_types` - Generate TypeScript types from your schema

### Edge Functions
- `mcp_supabase_list_edge_functions` - List deployed functions
- `mcp_supabase_get_edge_function` - Get function code
- `mcp_supabase_deploy_edge_function` - Deploy new functions

### Project Info
- `mcp_supabase_get_project_url` - Get project API URL
- `mcp_supabase_get_publishable_keys` - Get API keys
- `mcp_supabase_get_logs` - View logs by service
- `mcp_supabase_get_advisors` - Get security/performance recommendations

### Documentation
- `mcp_supabase_search_docs` - Search Supabase documentation

### Branches (Development)
- `mcp_supabase_create_branch` - Create a development branch
- `mcp_supabase_list_branches` - List branches
- `mcp_supabase_merge_branch` - Merge branch to production
- `mcp_supabase_rebase_branch` - Rebase branch
- `mcp_supabase_reset_branch` - Reset branch
- `mcp_supabase_delete_branch` - Delete branch

## Troubleshooting

### MCP Tools Not Appearing
1. **Check Cursor Version**: Ensure you're using a recent version of Cursor that supports MCP
2. **Restart Cursor**: After configuring MCP, restart Cursor completely
3. **Check Configuration Format**: Verify your `mcp.json` syntax is correct (use a JSON validator)

### Authentication Issues
1. **OAuth Not Working**: Try using a Personal Access Token instead
2. **PAT Expired**: Generate a new token and update your configuration
3. **Wrong Project**: Verify your `project_ref` matches your Supabase project ID

### Connection Errors
1. **Network Issues**: Ensure you can access `https://mcp.supabase.com`
2. **Project Access**: Verify your Supabase account has access to the project
3. **Rate Limits**: MCP has rate limits; wait a moment and try again

## Security Best Practices

1. **Never Commit Tokens**: Add `.cursor/mcp.json` to `.gitignore` if it contains tokens
2. **Use Scoped Tokens**: When possible, use tokens with minimal required permissions
3. **Rotate Tokens**: Regularly rotate your Personal Access Tokens
4. **Review Access**: Periodically review which MCP clients have access to your Supabase project

## Additional Resources

- [Supabase MCP Documentation](https://supabase.com/mcp)
- [Model Context Protocol Spec](https://modelcontextprotocol.io)
- [Cursor Documentation](https://cursor.sh/docs)

## Next Steps

Once configured, you can:
- Ask Claude to query your database directly
- Have Claude generate migrations for you
- Deploy Edge Functions through Claude
- Get real-time database insights
- Access Supabase documentation contextually

Example: *"Claude, query my players table and show me the top 10 players by batting average"*
