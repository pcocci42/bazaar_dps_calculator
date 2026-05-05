import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MOBALYTICS_ITEMS_QUERY } from "./mobalytics-items-query.js";

const RAW_DIR = path.resolve("data/raw");
const OUTPUT_DIR = path.resolve("data/import");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "mobalytics-items.json");

const GRAPHQL_URL = "https://mobalytics.gg/api/the-bazaar/v1/graphql/query";

type MobalyticsItem = {
  id: string;
  slug: string;
  icon?: string | null;
  name: string;
  size?: string | null;
  tags?: string[] | null;
  heroes?: Array<{ name: string }>;
  tierStats?: unknown[];
  enchantments?: unknown[] | null;
  ammo?: string | number | null;
  lifesteal?: string | number | null;
  multicast?: string | number | null;
  cooldown?: string | number | null;
  critchance?: string | number | null;
  descriptions?: string[];
  __typename?: string;
};

type PageInfo = {
  cursor: string | null;
  hasMoreItems: boolean;
  total: number;
};

function extractPreloadedState(html: string): unknown {
  const marker = "window.__PRELOADED_STATE__=";
  const start = html.indexOf(marker);

  if (start === -1) {
    throw new Error("window.__PRELOADED_STATE__ not found");
  }

  const jsonStart = start + marker.length;
  const end = html.indexOf(";</script>", jsonStart);

  if (end === -1) {
    throw new Error("Could not find end of __PRELOADED_STATE__ script");
  }

  return JSON.parse(html.slice(jsonStart, end));
}

function findBazaarItems(
  value: unknown,
  found: MobalyticsItem[] = []
): MobalyticsItem[] {
  if (!value || typeof value !== "object") return found;

  if (
    "__typename" in value &&
    (value as { __typename?: unknown }).__typename === "TheBazaarItem" &&
    "id" in value &&
    "name" in value
  ) {
    found.push(value as MobalyticsItem);
    return found;
  }

  if (Array.isArray(value)) {
    for (const item of value) findBazaarItems(item, found);
    return found;
  }

  for (const child of Object.values(value)) {
    findBazaarItems(child, found);
  }

  return found;
}

function findWikiDiscoveryWidget(
  value: unknown
): { widgetId: string; pageInfo: PageInfo | null } | null {
  if (!value || typeof value !== "object") return null;

  const obj = value as Record<string, unknown>;

  if (
    obj.__typename === "NgfDocumentCmWidgetWikiDiscoveryDetailedV1" &&
    typeof obj.id === "string"
  ) {
    const data = obj.data as
      | {
          discovery?: {
            items?: {
              pageInfo?: PageInfo;
            };
          };
        }
      | undefined;

    return {
      widgetId: obj.id,
      pageInfo: data?.discovery?.items?.pageInfo ?? null,
    };
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findWikiDiscoveryWidget(item);
      if (found) return found;
    }

    return null;
  }

  for (const child of Object.values(obj)) {
    const found = findWikiDiscoveryWidget(child);
    if (found) return found;
  }

  return null;
}

function extractSlugFromFileName(fileName: string): string {
  const name = fileName.replace(/^mobalytics-/, "").replace(/\.html$/, "");

  if (name === "all-items") {
    return "database/items-and-enchantments";
  }

  return name;
}

function runCurlJson(payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn("curl.exe", [
      "-L",
      "--silent",
      "--show-error",
      GRAPHQL_URL,
      "-X",
      "POST",
      "-H",
      "Content-Type: application/json",
      "-H",
      "Accept: application/json",
      "-H",
      "Origin: https://mobalytics.gg",
      "-H",
      "Referer: https://mobalytics.gg/the-bazaar/database/items-and-enchantments",
      "-H",
      "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "--data-raw",
      JSON.stringify(payload),
    ]);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`curl exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);

        if (parsed && typeof parsed === "object" && "errors" in parsed) {
          reject(
            new Error(
              `GraphQL returned errors:\n${JSON.stringify(parsed, null, 2).slice(
                0,
                4000
              )}`
            )
          );
          return;
        }

        resolve(parsed);
      } catch (error) {
        reject(
          new Error(
            `Failed to parse curl JSON response: ${String(error)}\nResponse preview:\n${stdout.slice(
              0,
              4000
            )}`
          )
        );
      }
    });
  });
}

async function fetchNextPage(
  slug: string,
  widgetId: string,
  cursor: string
): Promise<unknown> {
  return runCurlJson({
    operationName: "TheBazaarStFilterDocumentContentQuery",
    query: MOBALYTICS_ITEMS_QUERY,
    variables: {
      input: {
        slug,
        widgetsOverride: [
          {
            widgetID: widgetId,
            NgfDocumentCmWidgetWikiDiscoveryDetailedV1: {
              name: null,
              tags: null,
              cursor,
            },
          },
        ],
      },
    },
  });
}

function extractPageInfo(value: unknown): PageInfo | null {
  if (!value || typeof value !== "object") return null;

  const obj = value as Record<string, unknown>;

  if (
    obj.pageInfo &&
    typeof obj.pageInfo === "object" &&
    "hasMoreItems" in obj.pageInfo
  ) {
    return obj.pageInfo as PageInfo;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractPageInfo(item);
      if (found) return found;
    }

    return null;
  }

  for (const child of Object.values(obj)) {
    const found = extractPageInfo(child);
    if (found) return found;
  }

  return null;
}

async function saveDebugResponse(
  slug: string,
  page: number,
  data: unknown
): Promise<void> {
  const debugFile = path.join(OUTPUT_DIR, `debug-${slug}-page-${page}.json`);
  await writeFile(debugFile, JSON.stringify(data, null, 2), "utf-8");
  console.log(`Debug response saved to: ${debugFile}`);
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const files = await readdir(RAW_DIR);
  const htmlFiles = files.filter(
    (file) => file.startsWith("mobalytics-") && file.endsWith(".html")
  );

  const itemsById = new Map<string, MobalyticsItem>();

  for (const file of htmlFiles) {
    const slug = extractSlugFromFileName(file);
    const fullPath = path.join(RAW_DIR, file);

    console.log(`Reading initial HTML: ${file}`);

    const html = await readFile(fullPath, "utf-8");
    const state = extractPreloadedState(html);

    const initialItems = findBazaarItems(state);
    for (const item of initialItems) {
      itemsById.set(item.id, item);
    }

    const widget = findWikiDiscoveryWidget(state);

    if (!widget || !widget.pageInfo?.cursor) {
      console.log(
        `No pagination info found for ${slug}. Initial items: ${initialItems.length}`
      );
      continue;
    }

    console.log(
      `${slug}: initial ${initialItems.length}/${widget.pageInfo.total}, hasMore=${widget.pageInfo.hasMoreItems}`
    );

    let cursor: string | null = widget.pageInfo.cursor;
    let hasMoreItems = widget.pageInfo.hasMoreItems;
    let page = 2;

    while (hasMoreItems) {
      if (!cursor) {
        throw new Error(`Missing cursor for ${slug}, page ${page}`);
      }

      console.log(`${slug}: fetching page ${page}...`);

      const data = await fetchNextPage(slug, widget.widgetId, cursor);

      const pageItems = findBazaarItems(data);
      for (const item of pageItems) {
        itemsById.set(item.id, item);
      }

      const pageInfo = extractPageInfo(data);

      if (!pageInfo) {
        await saveDebugResponse(slug, page, data);
        throw new Error(`Could not extract pageInfo for ${slug}, page ${page}`);
      }

      console.log(
        `${slug}: page ${page} found ${pageItems.length}, total unique now ${itemsById.size}`
      );

      cursor = pageInfo.cursor;
      hasMoreItems = pageInfo.hasMoreItems;
      page += 1;
    }
  }

  const items = Array.from(itemsById.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  await writeFile(OUTPUT_FILE, JSON.stringify(items, null, 2), "utf-8");

  console.log(`Saved ${items.length} unique items to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});