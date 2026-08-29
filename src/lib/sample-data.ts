// Sample datasets generated procedurally so users can try DataIQ without uploading.
type Row = Record<string, unknown>;

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function salesDataset(): { name: string; rows: Row[] } {
  const r = rand(42);
  const regions = ["North", "South", "East", "West"];
  const products = ["Pro", "Standard", "Lite", "Enterprise"];
  const rows: Row[] = [];
  for (let i = 0; i < 500; i++) {
    const price = Math.round(50 + r() * 950);
    const qty = 1 + Math.floor(r() * 20);
    rows.push({
      order_id: 1000 + i,
      date: new Date(2024, Math.floor(r() * 12), 1 + Math.floor(r() * 27))
        .toISOString()
        .slice(0, 10),
      region: regions[Math.floor(r() * 4)],
      product: products[Math.floor(r() * 4)],
      price,
      quantity: qty,
      revenue: r() < 0.05 ? null : price * qty,
      discount_pct: Math.round(r() * 30),
      customer_age: Math.floor(18 + r() * 60),
    });
  }
  return { name: "sales_2024.csv", rows };
}

export function churnDataset(): { name: string; rows: Row[] } {
  const r = rand(7);
  const plans = ["Basic", "Pro", "Enterprise"];
  const rows: Row[] = [];
  for (let i = 0; i < 600; i++) {
    const tenure = Math.floor(r() * 72);
    const monthly = Math.round(20 + r() * 100);
    const churn = r() < (tenure < 6 ? 0.4 : 0.1) ? 1 : 0;
    rows.push({
      customer_id: 5000 + i,
      tenure_months: tenure,
      plan: plans[Math.floor(r() * 3)],
      monthly_charge: monthly,
      total_charges: monthly * Math.max(1, tenure),
      support_tickets: Math.floor(r() * 10),
      churn,
    });
  }
  return { name: "customer_churn.csv", rows };
}

export function titanicDataset(): { name: string; rows: Row[] } {
  const r = rand(99);
  const rows: Row[] = [];
  for (let i = 0; i < 891; i++) {
    const pclass = 1 + Math.floor(r() * 3);
    const sex = r() < 0.35 ? "female" : "male";
    const age = r() < 0.2 ? null : Math.round(r() * 70 + 1);
    const survived = sex === "female" ? (r() < 0.74 ? 1 : 0) : r() < 0.19 ? 1 : 0;
    rows.push({
      passenger_id: i + 1,
      survived,
      pclass,
      sex,
      age,
      sibsp: Math.floor(r() * 5),
      parch: Math.floor(r() * 4),
      fare: +(7 + r() * 200).toFixed(2),
    });
  }
  return { name: "titanic.csv", rows };
}

export function millionRowsDataset(count = 1000000): { name: string; rows: Row[] } {
  const r = rand(101);
  const categories = ["Cloud", "Analytics", "Security", "AI/ML", "DevOps"];
  const regions = ["US-East", "US-West", "EU-Central", "AP-South", "SA-East"];
  const rows: Row[] = [];
  // Build a high-performance 1M row synthetic set
  for (let i = 0; i < count; i++) {
    const usage = Math.round(10 + r() * 990);
    const cost = +(usage * (0.05 + r() * 0.15)).toFixed(2);
    rows.push({
      event_id: 1000000 + i,
      category: categories[Math.floor(r() * 5)],
      region: regions[Math.floor(r() * 5)],
      usage_units: usage,
      cost_usd: cost,
      latency_ms: Math.floor(5 + r() * 250),
      is_anomaly: r() < 0.02 ? 1 : 0,
    });
  }
  return { name: "bigdata_1m_telemetry.csv", rows };
}
