import { pwaIcon } from "@/lib/pwa-icon";

export async function GET() {
  return pwaIcon(512, true);
}
