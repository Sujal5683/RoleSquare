export interface PlanLimit {
  maxRecordsPerMonth: number;
  maxUsers?: number;
  supportLevel: string;
  ssoEnabled: boolean;
}

export interface PlanDef {
  id: "free" | "team" | "enterprise";
  name: string;
  priceUsd: number;
  description: string;
  limits: PlanLimit;
}

export const PLANS: Record<string, PlanDef> = {
  free: {
    id: "free",
    name: "Free",
    priceUsd: 0,
    description: "Perfect for exploring the platform and small projects.",
    limits: {
      maxRecordsPerMonth: 1000,
      supportLevel: "Community support",
      ssoEnabled: false,
    },
  },
  team: {
    id: "team",
    name: "Team",
    priceUsd: 49,
    description: "For growing teams needing more volume and priority support.",
    limits: {
      maxRecordsPerMonth: 10000,
      supportLevel: "Priority support",
      ssoEnabled: false,
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceUsd: 299,
    description: "Unlimited scale, dedicated account manager, and advanced security.",
    limits: {
      maxRecordsPerMonth: -1, // -1 means unlimited
      supportLevel: "Dedicated account manager",
      ssoEnabled: true,
    },
  },
};
