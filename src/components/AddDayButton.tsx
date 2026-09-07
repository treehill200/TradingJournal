"use client";

import { useState } from "react";
import DayPanel from "@/components/DayPanel";
import { IconPlus } from "@/components/Icons";
import { todayKey } from "@/lib/metrics";

export default function AddDayButton({ ccy, date }: { ccy: string; date?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        <IconPlus width={15} height={15} /> Add day
      </button>
      {open && <DayPanel date={date ?? todayKey()} ccy={ccy} onClose={() => setOpen(false)} />}
    </>
  );
}
