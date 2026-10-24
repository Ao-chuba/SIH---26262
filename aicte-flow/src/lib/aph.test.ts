import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidIntake, requiredFaculty } from "./aph";

describe("APH assistive calculations", () => {
  it("recognizes positive standard intake divisions", () => {
    assert.equal(isValidIntake(30), true);
    assert.equal(isValidIntake(60), true);
    assert.equal(isValidIntake(120), true);
    assert.equal(isValidIntake(73), false);
    assert.equal(isValidIntake(0), false);
    assert.equal(isValidIntake(60.5), false);
  });

  it("rounds required faculty up at the 1:20 benchmark", () => {
    assert.equal(requiredFaculty(20), 1);
    assert.equal(requiredFaculty(21), 2);
    assert.equal(requiredFaculty(120), 6);
  });
});
