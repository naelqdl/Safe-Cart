import type { Run } from "./trail";
import happy from "@/mock/run-happy.json";
import attack from "@/mock/run-attack.json";

// JSON widens unions to string, so `satisfies` can't be used; `as Run` still fails on missing or mistyped fields.
export const demoRuns: Run[] = [happy as Run, attack as Run];
