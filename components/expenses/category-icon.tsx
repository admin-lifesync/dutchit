import type { ExpenseCategory } from "@/lib/firebase/types";
import { cn } from "@/lib/utils";

const META: Record<ExpenseCategory, { emoji: string; label: string; tone: string }> = {
  food: { emoji: "🍔", label: "Food", tone: "bg-orange-500/10 text-orange-500" },
  fuel: { emoji: "⛽", label: "Fuel", tone: "bg-amber-500/10 text-amber-500" },
  hotel: { emoji: "🏨", label: "Hotel", tone: "bg-sky-500/10 text-sky-500" },
  shopping: {
    emoji: "🛍️",
    label: "Shopping",
    tone: "bg-pink-500/10 text-pink-500",
  },
  transport: {
    emoji: "🚕",
    label: "Transport",
    tone: "bg-emerald-500/10 text-emerald-500",
  },
  alcohol: {
    emoji: "🍻",
    label: "Alcohol",
    tone: "bg-violet-500/10 text-violet-500",
  },
  misc: { emoji: "🧾", label: "Misc", tone: "bg-muted text-muted-foreground" },
};

export const EXPENSE_CATEGORIES = Object.entries(META).map(([k, v]) => ({
  value: k as ExpenseCategory,
  ...v,
}));

export function CategoryIcon({
  category,
  size = "md",
  className,
}: {
  category: ExpenseCategory;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const meta = META[category];
  return (
    <span
      className={cn(
        "grid place-items-center rounded-xl",
        meta.tone,
        size === "sm" && "h-8 w-8 text-base",
        size === "md" && "h-10 w-10 text-lg",
        size === "lg" && "h-12 w-12 text-xl",
        className
      )}
      aria-label={meta.label}
    >
      {meta.emoji}
    </span>
  );
}

export function categoryLabel(c: ExpenseCategory) {
  return META[c].label;
}
