import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { APP_TYPE_ROUTE_MAP, ROUTES } from "../../config/rules";
import { STAGE_ACTION_ROLES, canAdvanceStage, canReturnApplication } from "../auth";
import { getNextStage, getRouteStages, routeHasStage } from "./routes";

describe("APH route catalogues (SIH26262)", () => {
  it("defines all five PS route combinations", () => {
    for (const key of [
      "ONLY_SCRUTINY",
      "SCRUTINY_EVC",
      "EVC_SAC_SHC",
      "ONLY_EVC",
      "SCRUTINY_EVC_SAC_SHC",
    ] as const) {
      assert.ok(ROUTES[key]?.length > 0, `missing route ${key}`);
    }
  });

  it("ends every route at DECISION_PENDING (human gate)", () => {
    for (const [key, stages] of Object.entries(ROUTES)) {
      assert.equal(stages[stages.length - 1], "DECISION_PENDING", key);
    }
  });

  it("maps application types onto known routes", () => {
    for (const [appType, route] of Object.entries(APP_TYPE_ROUTE_MAP)) {
      assert.ok(route in ROUTES, `${appType} → ${route}`);
    }
  });
});

describe("getNextStage", () => {
  it("walks ONLY_SCRUTINY without skipping the decision gate", () => {
    assert.equal(getNextStage("ONLY_SCRUTINY", "SCRUTINY"), "DECISION_PENDING");
    assert.equal(getNextStage("ONLY_SCRUTINY", "DECISION_PENDING"), null);
  });

  it("walks SCRUTINY_EVC_SAC_SHC in handbook order", () => {
    const path = [
      "SCRUTINY",
      "EVC_QUEUE",
      "EVC_SCHEDULED",
      "EVC_REPORT",
      "SAC_SHC",
      "DECISION_PENDING",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      assert.equal(getNextStage("SCRUTINY_EVC_SAC_SHC", path[i]), path[i + 1]);
    }
  });

  it("treats RE_SCRUTINY as SCRUTINY for progression", () => {
    assert.equal(getNextStage("SCRUTINY_EVC", "RE_SCRUTINY"), "EVC_QUEUE");
  });

  it("supports ONLY_EVC and EVC_SAC_SHC without inventing scrutiny", () => {
    assert.equal(getNextStage("ONLY_EVC", "EVC_QUEUE"), "EVC_SCHEDULED");
    assert.equal(getRouteStages("ONLY_EVC")[0], "EVC_QUEUE");
    assert.equal(routeHasStage("EVC_SAC_SHC", "SAC_SHC"), true);
    assert.equal(routeHasStage("ONLY_SCRUTINY", "EVC_QUEUE"), false);
  });

  it("returns an empty path and no next stage for unknown routes or stages", () => {
    assert.deepEqual(getRouteStages("UNKNOWN_ROUTE"), []);
    assert.equal(getNextStage("UNKNOWN_ROUTE", "SCRUTINY"), null);
    assert.equal(getNextStage("ONLY_SCRUTINY", "EVC_QUEUE"), null);
    assert.equal(routeHasStage("UNKNOWN_ROUTE", "SCRUTINY"), false);
  });

  it("does not advance beyond the human decision gate on any route", () => {
    for (const route of Object.keys(ROUTES)) {
      assert.equal(getNextStage(route, "DECISION_PENDING"), null, route);
    }
  });
});

describe("stage action gates", () => {
  const officer = { role: "REGIONAL_OFFICER" } as Parameters<typeof canAdvanceStage>[0];
  const bureau = { role: "BUREAU_OFFICER" } as Parameters<typeof canAdvanceStage>[0];
  const evc = { role: "EVC_COMMITTEE" } as Parameters<typeof canAdvanceStage>[0];

  it("blocks free advance from EVC_QUEUE, EVC_SCHEDULED, and DECISION_PENDING", () => {
    assert.deepEqual(STAGE_ACTION_ROLES.EVC_QUEUE, []);
    assert.deepEqual(STAGE_ACTION_ROLES.EVC_SCHEDULED, []);
    assert.deepEqual(STAGE_ACTION_ROLES.DECISION_PENDING, []);
    assert.equal(canAdvanceStage(officer, "EVC_QUEUE"), false);
    assert.equal(canAdvanceStage(evc, "EVC_SCHEDULED"), false);
    assert.equal(canAdvanceStage(bureau, "DECISION_PENDING"), false);
  });

  it("allows RO advance at scrutiny / EVC report; blocks return at decision", () => {
    assert.equal(canAdvanceStage(officer, "SCRUTINY"), true);
    assert.equal(canAdvanceStage(officer, "EVC_REPORT"), true);
    assert.equal(canReturnApplication(officer, "DECISION_PENDING"), false);
    assert.equal(canReturnApplication(officer, "EVC_QUEUE"), false);
  });
});
