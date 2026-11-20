import type { ReactNode } from "react";
import { Eye, PiggyBank, ShoppingBag, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { appConfig } from "@/config/app.config";
import { formatPrice } from "@/lib/format";
import type { DashboardState } from "@/lib/agent/types";

export function StatTiles({ state }: { state: DashboardState }) {
  const { missions, receipts } = state;
  const cur = appConfig.currency;
  const budget = appConfig.guardrails.dailyBudget;
  const watching = missions.filter((m) => m.status !== "done").length;
  const auto = receipts.filter((r) => r.auto).length;
  const spent = receipts.reduce((sum, r) => sum + r.amount, 0);
  const saved = receipts.reduce((sum, r) => sum + r.saved, 0);
  const pct = Math.min(100, Math.round((spent / budget) * 100));

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Tile icon={Eye} label="Watching" value={watching} sub={`${missions.length - watching} done`} />
      <Tile icon={ShoppingBag} label="Purchases" value={receipts.length} sub={`${auto} automatic · ${receipts.length - auto} approved`} />
      <Tile icon={Wallet} label="Spent today" value={formatPrice(spent, cur)} sub={`of ${formatPrice(budget, cur)} budget`}>
        <div
          role="progressbar"
          aria-label="Daily budget used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </Tile>
      <Tile icon={PiggyBank} label="Saved" value={formatPrice(saved, cur)} sub="vs list price" valueClass={saved > 0 ? "text-success" : undefined} />
    </div>
  );
}

function Tile({ icon: Icon, label, value, sub, valueClass, children }: { icon: LucideIcon; label: string; value: string | number; sub: string; valueClass?: string; children?: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 font-medium text-muted-foreground">
          <Icon className="size-4" aria-hidden />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn("text-2xl font-semibold tracking-tight tabular-nums", valueClass)}>{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
        {children}
      </CardContent>
    </Card>
  );
}
