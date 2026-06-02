"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

// ── Palette (matches mobile theme.ts) ─────────────────────────────────────────
const TERRACOTTA = "#21A090";     // brand teal (primary)
const TERRACOTTA_DIM = "#1A8174"; // teal dim
const FILL_COLORS = [
  "#21A090", // teal (primary)
  "#2E6EB0", // sky
  "#1E7A45", // jade
  "#8b5cf6", // violet
  "#D44030", // coral
  "#E0A82E", // warm gold
  "#475569", // slate
];

// ── Custom tooltip — shows just the formatted value, no label ─────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPayload = readonly any[];

function SimpleTooltip({
  active,
  payload,
  formatter,
}: {
  active?: boolean;
  payload?: AnyPayload;
  formatter?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const val = Number(payload[0]?.value ?? 0);
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-md">
      {formatter ? formatter(val) : val}
    </div>
  );
}

function PieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: AnyPayload;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-sm">
      <p className="font-semibold text-gray-900">{payload[0]?.name}</p>
      <p className="text-gray-600 mt-0.5">{formatCurrency(Number(payload[0]?.value ?? 0))}</p>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DailySale { date: string; total: number; orders: number; }
interface CategorySale { name: string; revenue: number; units: number; }
interface TopItem { name: string; units: number; revenue: number; }
interface HourlySale { hour: number; label: string; total: number; orders: number; }
interface DowSale { dow: string; avgTotal: number; total: number; }

// ── Charts ────────────────────────────────────────────────────────────────────

export function RevenueChart({ data }: { data: DailySale[] }) {
  if (!data.length) return <p className="text-center text-gray-400 py-8 text-sm">No data yet</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={TERRACOTTA} stopOpacity={0.25} />
            <stop offset="95%" stopColor={TERRACOTTA} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#DCE2EA" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} tickFormatter={(v) => `$${v}`} />
        <Tooltip
          content={(props) => (
            <SimpleTooltip
              active={props.active}
              payload={props.payload}
              formatter={formatCurrency}
            />
          )}
        />
        <Area
          type="monotone"
          dataKey="total"
          stroke={TERRACOTTA}
          strokeWidth={2}
          fill="url(#colorRevenue)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function OrdersChart({ data }: { data: DailySale[] }) {
  if (!data.length) return <p className="text-center text-gray-400 py-8 text-sm">No data yet</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#DCE2EA" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} allowDecimals={false} />
        <Tooltip
          content={(props) => (
            <SimpleTooltip
              active={props.active}
              payload={props.payload}
            />
          )}
        />
        <Bar dataKey="orders" fill="#2E6EB0" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryPieChart({ data }: { data: CategorySale[] }) {
  if (!data.length) return <p className="text-center text-gray-400 py-8 text-sm">No data yet</p>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="revenue"
          nameKey="name"
          cx="50%"
          cy="45%"
          outerRadius={90}
          innerRadius={40}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={FILL_COLORS[index % FILL_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={(props) => (
          <PieTooltip
            active={props.active}
            payload={props.payload}
          />
        )} />
        <Legend
          iconSize={10}
          iconType="circle"
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          formatter={(value) => (
            <span style={{ color: "#4D3B34" }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TopItemsChart({ data }: { data: TopItem[] }) {
  if (!data.length) return <p className="text-center text-gray-400 py-8 text-sm">No data yet</p>;
  // Height scales with the number of bars so 10 items aren't crushed; the name
  // axis gets room and long names are clipped with an ellipsis (full name in tooltip).
  const height = Math.max(220, data.length * 30 + 20);
  const clip = (s: string) => (s.length > 22 ? s.slice(0, 21) + "…" : s);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#DCE2EA" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} width={150} interval={0} tickFormatter={clip} />
        <Tooltip
          content={(props) => (
            <SimpleTooltip
              active={props.active}
              payload={props.payload}
            />
          )}
        />
        <Bar dataKey="units" radius={[0, 4, 4, 0]}>
          {data.map((_, index) => (
            <Cell key={index} fill={FILL_COLORS[index % FILL_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HourlyChart({ data }: { data: HourlySale[] }) {
  const active = data.filter(d => d.total > 0);
  if (!active.length) return <p className="text-center text-gray-400 py-8 text-sm">No data yet</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#DCE2EA" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} interval={1} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} tickFormatter={(v) => `$${v}`} />
        <Tooltip
          content={(props) => (
            <SimpleTooltip
              active={props.active}
              payload={props.payload}
              formatter={formatCurrency}
            />
          )}
        />
        <Bar dataKey="total" radius={[3, 3, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.total > 0 ? TERRACOTTA : "#DCE2EA"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DowChart({ data }: { data: DowSale[] }) {
  const hasData = data.some(d => d.avgTotal > 0);
  if (!hasData) return <p className="text-center text-gray-400 py-8 text-sm">No data yet</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#DCE2EA" />
        <XAxis dataKey="dow" tick={{ fontSize: 11 }} tickLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} tickFormatter={(v) => `$${v}`} />
        <Tooltip
          content={(props) => (
            <SimpleTooltip
              active={props.active}
              payload={props.payload}
              formatter={formatCurrency}
            />
          )}
        />
        <Bar dataKey="avgTotal" radius={[3, 3, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.avgTotal > 0 ? TERRACOTTA_DIM : "#DCE2EA"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
