---
name: Decorative Recharts pie charts
description: How to hide a Recharts pie chart when equivalent accessible data is already present.
---

When a pie chart duplicates an adjacent accessible list, mark the chart wrapper `aria-hidden="true"`, disable the chart accessibility layer, and set the `Pie` root tab index to `-1`.

**Why:** Recharts gives the pie root group `tabindex="0"` by default. Hiding only the wrapper triggers Lighthouse's `aria-hidden-focus` audit, while leaving the chart exposed can trigger `svg-img-alt` on generated sectors.

**How to apply:** Use this only for decorative or duplicate charts. If the chart is the sole representation of the data, provide an accessible chart name and equivalent text or table instead of hiding it.