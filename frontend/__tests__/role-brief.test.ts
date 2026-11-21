import { describe, expect, it } from "vitest";

import { toRoleBrief } from "@/lib/api";

describe("toRoleBrief (backend brief from POST /runs)", () => {
  it("maps a scammer brief: mission object -> text, dossier kept", () => {
    expect(
      toRoleBrief({
        role: "scammer",
        mission: { id: "m1", title: "Safe account", brief: "Get £1,200 moved." },
        dossier: ["Has a dog named Biscuit"],
      })
    ).toEqual({ role: "scammer", mission: "Safe account: Get £1,200 moved.", dossier: ["Has a dog named Biscuit"] });
  });

  it("maps a genuine brief: verification object -> readable details", () => {
    expect(
      toRoleBrief({ role: "genuine", need: "Pay landlord £950", verification: { date_of_birth: "1990-01-02", payees: ["Mum", "Gym"] } })
    ).toEqual({ role: "genuine", need: "Pay landlord £950", details: ["date of birth: 1990-01-02", "payees: Mum, Gym"] });
  });

  it("returns null for a missing brief", () => {
    expect(toRoleBrief(undefined)).toBeNull();
  });
});
