type MetricCardProps = {
  label: string;
  value: string | number;
  tone?: "default" | "green" | "orange" | "red";
};

export function MetricCard({ label, value, tone = "default" }: MetricCardProps) {
  return (
    <div className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString("th-TH", { maximumFractionDigits: 2 }) : value}</strong>
    </div>
  );
}
