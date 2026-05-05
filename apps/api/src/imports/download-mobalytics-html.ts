import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const OUTPUT_DIR = path.resolve("data/raw");

const PAGES = [
  {
    name: "all-items",
    url: "https://mobalytics.gg/the-bazaar/database/items-and-enchantments",
  },
  {
    name: "vanessa-items",
    url: "https://mobalytics.gg/the-bazaar/vanessa-items",
  },
  {
    name: "pygmalien-items",
    url: "https://mobalytics.gg/the-bazaar/pygmalien-items",
  },
  {
    name: "dooley-items",
    url: "https://mobalytics.gg/the-bazaar/dooley-items",
  },
  {
    name: "mak-items",
    url: "https://mobalytics.gg/the-bazaar/mak-items",
  },
  {
    name: "stelle-items",
    url: "https://mobalytics.gg/the-bazaar/stelle-items",
  },
  {
    name: "jules-items",
    url: "https://mobalytics.gg/the-bazaar/jules-items",
  },
  {
    name: "karnok-items",
    url: "https://mobalytics.gg/the-bazaar/karnok-items",
  },
];

function runCurl(url: string, outputFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("curl.exe", [
      "-L",
      "--fail",
      "--silent",
      "--show-error",
      url,
      "-o",
      outputFile,
      "-A",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    ]);

    child.stderr.on("data", (data) => {
      process.stderr.write(data);
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`curl exited with code ${code} for ${url}`));
    });
  });
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  for (const page of PAGES) {
    const outputFile = path.join(OUTPUT_DIR, `mobalytics-${page.name}.html`);

    console.log(`Downloading ${page.name}...`);
    await runCurl(page.url, outputFile);
    console.log(`Saved: ${outputFile}`);
  }

  console.log("Mobalytics HTML download completed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});