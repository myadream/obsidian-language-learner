import { describe, expect, it } from "vitest";
import { sm2Next } from "@/review/sm2";

const DAY = 86400;
const NOW = 1700000000;
const P = { baseEase: 250, easyBonus: 1.3, lapseFactor: 0.5, maximumInterval: 36525 };

/** 已有卡：interval 10、ease 250 */
const DUE = (delayDays: number) => ({ interval: 10, ease: 250, due: NOW - delayDays * DAY });

describe("sm2Next 新卡（interval 初值 1.0 / ease 初值 baseEase / delay 0）", () => {
  it("good → 2.5 天, ease 250", () => {
    const s = sm2Next(undefined, "good", NOW, P);
    expect(s.algorithm).toBe("SM-2");
    expect(s.interval).toBe(2.5);
    expect(s.ease).toBe(250);
    expect(s.due).toBe(NOW + 2.5 * DAY);
  });

  it("easy → 3.5 天, ease 270", () => {
    const s = sm2Next(undefined, "easy", NOW, P);
    expect(s.interval).toBe(3.5); // 1.0 * 2.7 * 1.3 = 3.51 → round 0.1
    expect(s.ease).toBe(270);
  });

  it("hard → 1 天, ease 230", () => {
    const s = sm2Next(undefined, "hard", NOW, P);
    expect(s.interval).toBe(1); // max(1, 1.0 * 0.5)
    expect(s.ease).toBe(230);
  });

  it("again → 0 天, ease 230, due = now", () => {
    const s = sm2Next(undefined, "again", NOW, P);
    expect(s.interval).toBe(0);
    expect(s.ease).toBe(230);
    expect(s.due).toBe(NOW);
  });

  it("只填 SM-2 字段，无 FSRS 字段", () => {
    const s = sm2Next(undefined, "good", NOW, P);
    expect(s.stability).toBeUndefined();
    expect(s.difficulty).toBeUndefined();
    expect(s.state).toBeUndefined();
    expect(s.reps).toBeUndefined();
    expect(s.lapses).toBeUndefined();
    expect(s.lastReview).toBeUndefined();
  });
});

describe("sm2Next 已有卡（interval 10, ease 250, delay 0）", () => {
  it("good → 25 天, ease 250", () => {
    const s = sm2Next(DUE(0), "good", NOW, P);
    expect(s.interval).toBe(25);
    expect(s.ease).toBe(250);
  });

  it("easy → 35.1 天, ease 270", () => {
    const s = sm2Next(DUE(0), "easy", NOW, P);
    expect(s.interval).toBe(35.1);
    expect(s.ease).toBe(270);
  });

  it("hard → 5 天, ease 230", () => {
    const s = sm2Next(DUE(0), "hard", NOW, P);
    expect(s.interval).toBe(5);
    expect(s.ease).toBe(230);
  });

  it("again → 0 天, ease 230", () => {
    const s = sm2Next(DUE(0), "again", NOW, P);
    expect(s.interval).toBe(0);
    expect(s.ease).toBe(230);
  });
});

describe("sm2Next 延迟 10 天（delay 半算/全算/四分之一算）", () => {
  it("good → (10+10/2)*2.5 = 37.5", () => {
    expect(sm2Next(DUE(10), "good", NOW, P).interval).toBe(37.5);
  });

  it("easy → (10+10)*2.7*1.3 = 70.2", () => {
    expect(sm2Next(DUE(10), "easy", NOW, P).interval).toBe(70.2);
  });

  it("hard → max(1, (10+2.5)*0.5) = 6.3", () => {
    expect(sm2Next(DUE(10), "hard", NOW, P).interval).toBe(6.3);
  });

  it("again → 0", () => {
    expect(sm2Next(DUE(10), "again", NOW, P).interval).toBe(0);
  });
});

describe("sm2Next 边界", () => {
  it("ease 下限 130：ease 130 + again 仍 130", () => {
    const s = sm2Next({ interval: 10, ease: 130, due: NOW }, "again", NOW, P);
    expect(s.ease).toBe(130);
  });

  it("ease 下限 130：ease 120 + hard 回到 130", () => {
    const s = sm2Next({ interval: 10, ease: 120, due: NOW }, "hard", NOW, P);
    expect(s.ease).toBe(130);
  });

  it("clamp maximumInterval：interval 30000 + easy → 36525", () => {
    const s = sm2Next({ interval: 30000, ease: 250, due: NOW }, "easy", NOW, P);
    expect(s.interval).toBe(36525);
  });

  it("round 到 0.1 天", () => {
    // (10 + 10/2) * 2.51 = 37.65 → 37.7（round half up）
    const s = sm2Next({ interval: 10, ease: 251, due: NOW - 10 * DAY }, "good", NOW, P);
    expect(s.interval).toBe(37.7);
  });

  it("未来卡 delay 不为负（提前复习按 0 延迟）", () => {
    const s = sm2Next({ interval: 10, ease: 250, due: NOW + 5 * DAY }, "good", NOW, P);
    expect(s.interval).toBe(25);
  });
});
