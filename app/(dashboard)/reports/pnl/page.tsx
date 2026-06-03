"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { PnlStatement } from "./pnl-statement";

function firstOfMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Direct route kept for bookmarks; the statement also lives under Reports → P&L.
export default function PnlPage() {
  const [from, setFrom] = useState(firstOfMonthISO());
  const [to, setTo] = useState(todayISO());
  return (
    <div className="flex flex-col h-full">
      <Header title="P&L Statement" description="Full operating statement — auto-filled from POS, labor & recipes; overhead entered by managers." />
      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-gray-200 px-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-gray-200 px-2 text-sm" />
          </div>
        </div>
        <PnlStatement from={from} to={to} />
      </div>
    </div>
  );
}
