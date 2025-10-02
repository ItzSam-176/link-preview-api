// server.js
const express = require("express");
const got = require("got");
const cheerio = require("cheerio");
const metascraper = require("metascraper")([
  require("metascraper-title")(),
  require("metascraper-description")(),
  require("metascraper-image")(),
  require("metascraper-url")(),
  require("metascraper-video")(),
]);
const { Cluster } = require("puppeteer-cluster");
const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteerExtra.use(StealthPlugin());

const isProd = process.env.NODE_ENV === "production";

// Use puppeteer-core in production, full puppeteer locally
const puppeteer = isProd ? require("puppeteer-core") : require("puppeteer");
const chromium = isProd ? require("@sparticuz/chromium") : null;

const app = express();
app.use(express.json());

/* --- Config --- */
const MAX_CONCURRENCY = 1;
const GOTO_TIMEOUT = 60000; // 60s for slow JS pages
const PUPPETEER_RETRIES = 2;

let cluster;

/* --- Determine executable path --- */
const getExecutablePath = async () => {
  if (isProd) {
    return await chromium.executablePath();
  } else {
    // macOS local dev
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
};

/* --- Test Puppeteer startup --- */
(async () => {
  try {
    const executablePath = await getExecutablePath();
    console.log("🔹 Testing Puppeteer...");
    const browser = await puppeteer.launch({
      headless: isProd ? chromium.headless : true,
      args: isProd ? chromium.args : [],
      executablePath,
      ignoreHTTPSErrors: true,
    });
    const page = await browser.newPage();
    await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
    console.log(
      "🔹 Puppeteer launched successfully! Page title:",
      await page.title()
    );
    await browser.close();
  } catch (err) {
    console.error("❌ Puppeteer failed to launch:", err);
  }
})();

/* --- Initialize Puppeteer Cluster --- */
async function initCluster() {
  const executablePath = await getExecutablePath();

  cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: MAX_CONCURRENCY,
    puppeteer: puppeteerExtra,
    puppeteerOptions: {
      headless: isProd ? chromium.headless : true,
      executablePath,
      args: isProd
        ? chromium.args.concat([
            "--disable-dev-shm-usage",
            "--disable-setuid-sandbox",
            "--no-sandbox",
            "--disable-blink-features=AutomationControlled",
          ])
        : [],
    },
    timeout: GOTO_TIMEOUT + 10000,
  });

  cluster.task(async ({ page, data: url, worker }) => {
    console.log(`Puppeteer Worker ${worker.id} started: ${url}`);

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({ "accept-language": "en-US,en;q=0.9" });

    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: GOTO_TIMEOUT,
      });
      await page
        .waitForSelector('meta[property="og:title"]', { timeout: 10000 })
        .catch(() => {});
      return await page.content();
    } finally {
      console.log(`Puppeteer Worker ${worker.id} finished: ${url}`);
    }
  });
}

/* --- Utilities --- */
function sanitizeUrl(url) {
  try {
    return encodeURI(url.trim());
  } catch {
    return url.trim();
  }
}

async function expandUrl(shortUrl) {
  const url = shortUrl.trim().startsWith("http")
    ? shortUrl.trim()
    : "https://" + shortUrl.trim();
  try {
    const res = await got(url, {
      method: "HEAD",
      followRedirect: true,
      throwHttpErrors: false,
      timeout: 10000,
    });
    return res.url || url;
  } catch {
    return url;
  }
}

/* --- Cheerio scraping --- */
async function scrapeWithCheerio(url) {
  const { body } = await got(url, {
    headers: { "user-agent": "Mozilla/5.0" },
    timeout: { request: 15000 },
  });
  const $ = cheerio.load(body);
  const getMeta = (name) =>
    $(`meta[property='${name}']`).attr("content") ||
    $(`meta[name='${name}']`).attr("content") ||
    null;

  return {
    title: getMeta("og:title") || $("title").text() || null,
    description: getMeta("og:description") || getMeta("description") || null,
    image: getMeta("og:image") || getMeta("twitter:image") || null,
    url: getMeta("og:url") || url,
    video: getMeta("og:video") || getMeta("twitter:player") || null,
  };
}

/* --- Metascraper fallback --- */
async function scrapeWithMetascraper(url) {
  const { body } = await got(url, {
    headers: { "user-agent": "Mozilla/5.0" },
    timeout: { request: 15000 },
  });
  return metascraper({ html: body, url });
}

/* --- Puppeteer scraping with retries --- */
async function scrapeWithPuppeteer(url, retries = PUPPETEER_RETRIES) {
  if (!cluster) throw new Error("Puppeteer cluster not initialized");
  try {
    const queuedAt = Date.now();
    const html = await cluster.execute(url);
    console.log(
      `URL ${url} waited ${((Date.now() - queuedAt) / 1000).toFixed(
        2
      )}s in queue`
    );
    const $ = cheerio.load(html || "");
    const getMeta = (name) =>
      $(`meta[property='${name}']`).attr("content") ||
      $(`meta[name='${name}']`).attr("content") ||
      null;

    return {
      title: getMeta("og:title") || $("title").text() || null,
      description: getMeta("og:description") || getMeta("description") || null,
      image: getMeta("og:image") || getMeta("twitter:image") || null,
      url: getMeta("og:url") || url,
      video: getMeta("og:video") || getMeta("twitter:player") || null,
    };
  } catch (err) {
    if (retries > 0) return scrapeWithPuppeteer(url, retries - 1);
    return null;
  }
}

/* --- JS-heavy site detection --- */
function isJsHeavySite(url) {
  const jsHeavyHosts = ["barnesandnoble"];
  try {
    const hostname = new URL(url).hostname;
    return jsHeavyHosts.some((h) => hostname.includes(h));
  } catch {
    return false;
  }
}

/* --- Hybrid API Route --- */
app.post("/preview", async (req, res) => {
  let { url } = req.body;
  if (!url) return res.status(400).json({ error: "Missing 'url'" });

  try {
    url = sanitizeUrl(await expandUrl(url));
    let metadata = null;

    if (isJsHeavySite(url)) {
      metadata = await scrapeWithPuppeteer(url);
    } else {
      metadata = await scrapeWithCheerio(url);
      if (!metadata.title || !metadata.description || !metadata.image)
        metadata = await scrapeWithMetascraper(url);
      if (!metadata.title || !metadata.description || !metadata.image) {
        const puppeteerMeta = await scrapeWithPuppeteer(url);
        if (puppeteerMeta) metadata = puppeteerMeta;
      }
    }

    if (!metadata)
      metadata = {
        title: "Failed to fetch metadata",
        description: null,
        image: null,
        url,
        video: null,
      };

    return res.json(metadata);
  } catch (err) {
    console.error("❌ Error fetching metadata:", err.stack || err);
    return res.json({
      title: "Couldn't fetch data",
      description: "An error occurred while fetching metadata.",
      image: null,
      url,
      video: null,
    });
  }
});

/* --- Start server --- */
initCluster().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Server running at port ${PORT}`));
});

/* --- Graceful shutdown --- */
process.on("SIGINT", async () => {
  console.log("Shutting down Puppeteer cluster...");
  if (cluster) await cluster.close();
  process.exit();
});
