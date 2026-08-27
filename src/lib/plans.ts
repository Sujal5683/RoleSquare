export interface PlanLimit {
  maxRecordsPerMonth: number;
  maxAiTokensPerMonth: number;
  maxAiJobsPerMonth: number;
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
      maxAiTokensPerMonth: 10000, // Developer can change this
      maxAiJobsPerMonth: 50,
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
      maxAiTokensPerMonth: 100000,
      maxAiJobsPerMonth: 500,
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
      maxAiTokensPerMonth: -1,
      maxAiJobsPerMonth: -1,
      supportLevel: "Dedicated account manager",
      ssoEnabled: true,
    },
  },
};
