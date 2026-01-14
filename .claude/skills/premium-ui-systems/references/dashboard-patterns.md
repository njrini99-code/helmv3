# Dashboard Patterns

Systematic patterns for data-heavy, action-oriented interfaces.

## Core Dashboard Structure

```
┌─────────────────────────────────────────────────────┐
│  KPI ROW (3-7 metrics with deltas)                  │  ← Answers "How are we doing?"
├─────────────────────────────────────────────────────┤
│  TREND BAND (1-3 charts showing why)                │  ← Answers "Why is this happening?"
├─────────────────────────────────────────────────────┤
│  ACTION TABLE (where users do their work)           │  ← Answers "What should I do?"
└─────────────────────────────────────────────────────┘
```

**Rule**: Each section has ONE job. Don't mix KPIs with actions.

---

## KPI Cards

### Structure

Every KPI card needs:
1. **Label** - What metric
2. **Value** - Current number (largest element)
3. **Delta** - Change indicator (↑↓)
4. **Trend** - Sparkline or mini-chart (optional)

```tsx
<div className="p-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
  {/* Label */}
  <div className="text-sm text-gray-600 mb-1">Total Revenue</div>
  
  {/* Value */}
  <div className="text-3xl font-bold text-gray-900 mb-2">$45,231</div>
  
  {/* Delta */}
  <div className="flex items-center gap-2 text-sm">
    <span className="flex items-center text-green-600 font-medium">
      <TrendingUpIcon className="w-4 h-4 mr-1" />
      12.5%
    </span>
    <span className="text-gray-500">vs last month</span>
  </div>
  
  {/* Optional: Mini chart */}
  <div className="mt-4 h-8">
    <Sparkline data={[...]} />
  </div>
</div>
```

### KPI Grid Layout

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  <KPICard label="Revenue" value="$45,231" delta="+12.5%" trend="up" />
  <KPICard label="Users" value="2,847" delta="+5.2%" trend="up" />
  <KPICard label="Conversion" value="3.2%" delta="-0.4%" trend="down" />
  <KPICard label="MRR" value="$12,450" delta="+8.1%" trend="up" />
</div>
```

**Critical**: KPI cards ALWAYS solid backgrounds. Never glass. Data readability is non-negotiable.

---

## Chart Patterns

### Chart Principles

1. **Direct labeling**: Label data points directly, not in legends
2. **Minimal gridlines**: Only show what helps reading
3. **Clear annotation**: Highlight anomalies/important points
4. **Appropriate chart type**: Match chart to data type

### Chart Type Selection

| Data Type | Chart Type | When to Use |
|-----------|-----------|-------------|
| Change over time | Line chart | Trends, continuous data |
| Comparison of categories | Bar chart | Comparing distinct items |
| Part-to-whole | Pie/donut | Proportions (use sparingly) |
| Correlation | Scatter plot | Relationship between variables |
| Distribution | Histogram | Frequency distribution |
| Multiple metrics over time | Multi-line | Comparing trends |

### Chart Implementation

```tsx
// LINE CHART (Recharts example)
<ResponsiveContainer width="100%" height={300}>
  <LineChart data={data}>
    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
    <XAxis 
      dataKey="date" 
      tick={{ fontSize: 12, fill: '#6b7280' }}
      axisLine={{ stroke: '#e5e7eb' }}
    />
    <YAxis 
      tick={{ fontSize: 12, fill: '#6b7280' }}
      axisLine={{ stroke: '#e5e7eb' }}
    />
    <Tooltip 
      contentStyle={{ 
        background: 'white', 
        border: '1px solid #e5e7eb',
        borderRadius: '8px' 
      }}
    />
    <Line 
      type="monotone" 
      dataKey="revenue" 
      stroke="#2563eb" 
      strokeWidth={2}
      dot={false}
    />
  </LineChart>
</ResponsiveContainer>
```

**Chart Container**:
```tsx
<div className="p-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
  <div className="flex items-center justify-between mb-6">
    <h3 className="text-lg font-semibold">Revenue Trend</h3>
    <select className="text-sm border border-gray-300 rounded-lg px-3 py-1.5">
      <option>Last 7 days</option>
      <option>Last 30 days</option>
      <option>Last 90 days</option>
    </select>
  </div>
  <Chart />
</div>
```

---

## Data Tables

### Table Structure

```tsx
<div className="overflow-x-auto rounded-lg border border-gray-200">
  <table className="w-full bg-white">
    {/* STICKY HEADER */}
    <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
      <tr>
        {/* Checkbox for multi-select */}
        <th className="px-4 py-3 w-12">
          <input type="checkbox" className="rounded" />
        </th>
        
        {/* Sortable columns */}
        <th className="px-4 py-3 text-left">
          <button className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900">
            Name
            <ChevronDownIcon className="w-4 h-4" />
          </button>
        </th>
        
        <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
          Status
        </th>
        
        <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
          Created
        </th>
        
        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
          Actions
        </th>
      </tr>
    </thead>
    
    {/* ROWS */}
    <tbody className="divide-y divide-gray-200">
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3">
          <input type="checkbox" className="rounded" />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="avatar.jpg" className="w-8 h-8 rounded-full" />
            <div>
              <div className="text-sm font-medium text-gray-900">John Doe</div>
              <div className="text-sm text-gray-500">john@example.com</div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Active
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-600">
          Jan 10, 2026
        </td>
        <td className="px-4 py-3 text-right">
          <button className="text-sm text-gray-600 hover:text-gray-900">
            Edit
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### Bulk Actions

When rows are selected, show bulk action bar:

```tsx
{selectedRows.length > 0 && (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20">
    <div className="flex items-center gap-4 px-6 py-3 rounded-full bg-gray-900 text-white shadow-lg">
      <span className="text-sm font-medium">{selectedRows.length} selected</span>
      <div className="flex gap-2">
        <button className="px-3 py-1.5 text-sm rounded-lg bg-white/10 hover:bg-white/20">
          Export
        </button>
        <button className="px-3 py-1.5 text-sm rounded-lg bg-white/10 hover:bg-white/20">
          Archive
        </button>
        <button className="px-3 py-1.5 text-sm rounded-lg bg-red-600 hover:bg-red-700">
          Delete
        </button>
      </div>
    </div>
  </div>
)}
```

### Table Features Checklist

- [ ] Sticky header for scrolling
- [ ] Row hover states
- [ ] Multi-select with checkboxes
- [ ] Bulk actions when rows selected
- [ ] Sortable columns
- [ ] Consistent row height
- [ ] Solid background (NEVER glass)
- [ ] Loading state (skeleton rows)
- [ ] Empty state design
- [ ] Pagination or infinite scroll

---

## Filters and Toolbar

### Filter Bar (Glass OK here - it's chrome)

```tsx
<div className="sticky top-0 z-10 mb-6 p-4 rounded-xl border border-white/20 backdrop-blur-md bg-white/70">
  <div className="flex items-center gap-4">
    {/* Search */}
    <div className="flex-1">
      <input
        type="search"
        placeholder="Search..."
        className="w-full px-4 py-2 rounded-lg border border-gray-300 bg-white focus:ring-2 focus:ring-gray-900"
      />
    </div>
    
    {/* Filters */}
    <select className="px-4 py-2 rounded-lg border border-gray-300 bg-white">
      <option>All Status</option>
      <option>Active</option>
      <option>Inactive</option>
    </select>
    
    <select className="px-4 py-2 rounded-lg border border-gray-300 bg-white">
      <option>Last 7 days</option>
      <option>Last 30 days</option>
      <option>Last 90 days</option>
    </select>
    
    {/* Actions */}
    <button className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800">
      Export
    </button>
  </div>
</div>
```

---

## Navigation Patterns

### Sidebar Navigation

```tsx
<aside className="w-64 h-screen sticky top-0 p-4 border-r border-gray-200 bg-white">
  <div className="mb-8">
    <img src="logo.svg" className="h-8" />
  </div>
  
  <nav className="space-y-1">
    <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-100 text-gray-900 font-medium">
      <HomeIcon className="w-5 h-5" />
      Dashboard
    </a>
    <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900">
      <UsersIcon className="w-5 h-5" />
      Users
    </a>
    <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900">
      <SettingsIcon className="w-5 h-5" />
      Settings
    </a>
  </nav>
</aside>
```

### Command Palette (⌘K)

Power users love keyboard shortcuts:

```tsx
// Trigger with ⌘K or Ctrl+K
<div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
  
  <div className="relative z-10 w-full max-w-2xl">
    <div className="rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
      {/* Search */}
      <input
        type="search"
        placeholder="Search or jump to..."
        className="w-full px-6 py-4 text-lg border-b border-gray-200 focus:outline-none"
      />
      
      {/* Results */}
      <div className="max-h-96 overflow-y-auto">
        <div className="p-2">
          <div className="px-3 py-2 text-xs font-medium text-gray-500">QUICK ACTIONS</div>
          <button className="w-full px-3 py-2 text-left rounded-lg hover:bg-gray-100 flex items-center gap-3">
            <PlusIcon className="w-4 h-4 text-gray-600" />
            <span>Create new project</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## Dashboard Layout Patterns

### Grid Dashboard

```tsx
<div className="grid grid-cols-12 gap-6">
  {/* KPIs - Full width */}
  <div className="col-span-12">
    <KPIRow />
  </div>
  
  {/* Main chart - 8 cols */}
  <div className="col-span-12 lg:col-span-8">
    <ChartCard />
  </div>
  
  {/* Side panel - 4 cols */}
  <div className="col-span-12 lg:col-span-4">
    <ActivityFeed />
  </div>
  
  {/* Table - Full width */}
  <div className="col-span-12">
    <DataTable />
  </div>
</div>
```

### Bento Dashboard

```tsx
<div className="grid grid-cols-6 gap-4">
  {/* Hero metric */}
  <div className="col-span-6 lg:col-span-4 row-span-2">
    <LargeKPICard />
  </div>
  
  {/* Supporting metrics */}
  <div className="col-span-3 lg:col-span-2">
    <SmallKPICard />
  </div>
  <div className="col-span-3 lg:col-span-2">
    <SmallKPICard />
  </div>
  
  {/* Charts */}
  <div className="col-span-6 lg:col-span-3">
    <ChartCard />
  </div>
  <div className="col-span-6 lg:col-span-3">
    <ChartCard />
  </div>
</div>
```

---

## Critical Dashboard Rules

1. **Solid backgrounds for data**: Tables, charts, KPIs - NEVER glass
2. **Glass for chrome**: Nav, filters, toolbars - glass OK
3. **Sticky elements**: Headers, filter bars
4. **Clear hierarchy**: KPIs → Charts → Tables
5. **Consistent row rhythm**: Tables need predictable spacing
6. **Hover feedback**: All interactive elements
7. **Loading states**: Skeleton loaders for async data
8. **Empty states**: Design for zero-data scenarios
9. **Bulk actions**: Multi-select + action bar
10. **Responsive**: Works on tablet/mobile
