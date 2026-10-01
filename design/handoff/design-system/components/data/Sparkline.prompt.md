Smooth micro-trend with honest color: green when the series improved, red when it worsened, dashed mean reference, haloed end point.

```jsx
<Sparkline data={[74.2,73.8,73.1,72.6,72.0]} goodWhen="down" invert baseline="mean" label="−2.2" />
<Sparkline fluid height={72} data={d} goodWhen="down" invert />
```

- For scoring (lower is better) pass `goodWhen="down" invert` so improvement rises and reads green.
- `fluid` fills its container; used full-bleed in MetricCard.
