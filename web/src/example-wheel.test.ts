/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"
import { cycleValue, getWheelStep } from "./example-wheel.ts"

Deno.test("getWheelStep uses dominant wheel axis", () => {
  assertEquals(getWheelStep({ deltaX: 0, deltaY: 120 }), 1)
  assertEquals(getWheelStep({ deltaX: 0, deltaY: -120 }), -1)
  assertEquals(getWheelStep({ deltaX: 80, deltaY: 10 }), 1)
  assertEquals(getWheelStep({ deltaX: -80, deltaY: 10 }), -1)
  assertEquals(getWheelStep({ deltaX: 0, deltaY: 0 }), 0)
})

Deno.test("cycleValue wraps around options", () => {
  const values = ["a", "b", "c"] as const
  assertEquals(cycleValue(values, "a", 1), "b")
  assertEquals(cycleValue(values, "a", -1), "c")
  assertEquals(cycleValue(values, "c", 1), "a")
  assertEquals(cycleValue(values, "x", 1), undefined)
})
