Aligned ledger for comparison: rosters, rounds, leaderboards. Put it inside `<Surface padded={false}>`.

```jsx
<DataTable rowKey="id" onRowClick={open} columns={[{key:'name',label:'Player',render:r=><PlayerIdentity name={r.name} meta={r.year} size="sm"/>},{key:'avg',label:'Avg',align:'right',numeric:true,sortable:true}]} rows={players} />
```
