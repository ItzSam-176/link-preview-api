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

const app = express();
app.use(express.json());

/* --- Config --- */
const MAX_CONCURRENCY = 1;
const GOTO_TIMEOUT = 60000; // 60s for slow JS pages
const GOT_REQUEST_TIMEOUT = 20000;
const PUPPETEER_RETRIES = 2;

let cluster;

/* --- Initialize Puppeteer Cluster --- */
async function initCluster() {
  cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: MAX_CONCURRENCY,
    puppeteer: puppeteerExtra,
    puppeteerOptions: {
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-blink-features=AutomationControlled",
      ],
    },
    timeout: GOTO_TIMEOUT + 10000,
  });

  cluster.task(async ({ page, data: url, worker }) => {
    console.log(`Puppeteer Worker ${worker.id} started: ${url}`);

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36 Edg/118.0.2088.0"
    );

    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({ "accept-language": "en-US,en;q=0.9" });

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForTimeout(2000); // allow JS to finish

    const metadata = await page.evaluate(() => {
      const get = (name) =>
        document.querySelector(`meta[property='${name}']`)?.content ||
        document.querySelector(`meta[name='${name}']`)?.content ||
        null;

      return {
        title: get("og:title") || document.title || null,
        description: get("og:description") || get("description") || null,
        image: get("og:image") || get("twitter:image") || null,
        url: get("og:url") || window.location.href,
        video: get("og:video") || get("twitter:player") || null,
      };
    });

    console.log(`Puppeteer Worker ${worker.id} finished: ${url}`);
    return metadata;
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

/* --- Fast-path scraping: Cheerio --- */
// /* --- Scraper with Cheerio (fast) --- */
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

/* --- Scraper with Metascraper (fallback) --- */
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

/* --- Detect JS-heavy sites --- */
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
      console.log("Using Puppeteer-first for JS-heavy page:", url);
      metadata = await scrapeWithPuppeteer(url);
    } else {
      // 1️⃣ Cheerio fast-path
      metadata = await scrapeWithCheerio(url);
      console.log("Cheerio result:", metadata);

      // 2️⃣ Fallback to Metascraper
      if (!metadata.title || !metadata.description || !metadata.image) {
        console.log("⚠️ Falling back to Metascraper...", url);
        metadata = await scrapeWithMetascraper(url);
        console.log("Metascraper result:", metadata);
      }

      // 3️⃣ Final fallback: Puppeteer cluster
      if (!metadata.title || !metadata.description || !metadata.image) {
        console.log("⚠️ Falling back to Puppeteer Cluster...", url);
        const puppeteerMeta = await scrapeWithPuppeteer(url);
        console.log("Puppeteer result:", puppeteerMeta);
        if (puppeteerMeta) metadata = puppeteerMeta;
      }
    }

    if (!metadata) {
      metadata = {
        title: "Failed to fetch metadata",
        description: null,
        image: null,
        url,
        video: null,
      };
    }

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

  app.listen(PORT, () => {
    console.log(`🚀 Server running at port ${PORT}`);
  });
});

/* --- Graceful shutdown --- */
process.on("SIGINT", async () => {
  console.log("Shutting down Puppeteer cluster...");
  if (cluster) await cluster.close();
  process.exit();
});
