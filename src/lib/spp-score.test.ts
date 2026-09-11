import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCushingPnode, parseSppCsv, scoreSpp } from "./cfam-field.ts";

const CSV = `Interval,GMTIntervalEnd,Pnode,LMP,MLC,MCC,MEC,BAA
09/10/2026 21:45:00,09/11/2026 02:45:00,OKGECUSHOIL2LDLD1,34.5,0.5,3.8,30.2,SPP
09/10/2026 21:45:00,09/11/2026 02:45:00,FARAWAY_NODE,24.0,0.2,0.1,23.7,SPP
09/10/2026 21:45:00,09/11/2026 02:45:00,SECISHELLEYLD1,21.2,-0.4,-0.4,22.0,SPP
09/10/2026 21:45:00,09/11/2026 02:45:00,BADCUSH,30.0,0.5,500.0,30.2,SPP
`;

describe("091-SPP live pinch", () => {
  it("keeps CUSH / PAYNE, drops SHELL false friends", () => {
    assert.equal(isCushingPnode("OKGECUSHOIL2LDLD1"), true);
    assert.equal(isCushingPnode("OKGEPAYNELDXF3"), true);
    assert.equal(isCushingPnode("SECISHELLEYLD1"), false);
    assert.equal(isCushingPnode("SPSSHELL_COLD7"), false);
  });

  it("parses latest interval schema and gates residual", () => {
    const rows = parseSppCsv(CSV);
    assert.equal(rows.length, 4);
    const scored = scoreSpp(rows);
    assert.equal(scored.n, 1);
    assert.ok(scored.mcc != null && Math.abs(scored.mcc - 3.8) < 1e-9);
    assert.ok(scored.score > 10);
  });
});
