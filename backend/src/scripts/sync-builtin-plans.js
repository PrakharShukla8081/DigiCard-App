import { assertEnv } from "../config/env.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { syncBuiltInPlans } from "../services/builtinPlans.js";

assertEnv();
const apply = process.argv.includes("--apply");
try {
  await connectDB();
  const result = await syncBuiltInPlans({ apply });
  console.table(result.summary);
  console.log(apply ? "Built-in plan sync applied." : "Dry run only. Re-run with --apply to write changes.");
} finally {
  await disconnectDB();
}
