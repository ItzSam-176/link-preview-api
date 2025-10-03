// // server.js
// const express = require("express");
// const got = require("got");
// const cheerio = require("cheerio");
// const metascraper = require("metascraper")([
//   require("metascraper-title")(),
//   require("metascraper-description")(),
//   require("metascraper-image")(),
//   require("metascraper-url")(),
//   require("metascraper-video")(),
// ]);
// const { Cluster } = require("puppeteer-cluster");
// const puppeteerExtra = require("puppeteer-extra");
// const StealthPlugin = require("puppeteer-extra-plugin-stealth");
// require("dotenv").config();
// const chromium = require("@sparticuz/chromium");

// puppeteerExtra.use(StealthPlugin());

// const app = express();
// app.use(express.json());

// /* --- Config --- */
// const MAX_CONCURRENCY = 1;
// const GOTO_TIMEOUT = 60000; // 60s for slow JS pages
// const GOT_REQUEST_TIMEOUT = 20000;
// const PUPPETEER_RETRIES = 2;

// let cluster;

// /* --- Initialize Puppeteer Cluster --- */
// // async function initCluster() {
// //   cluster = await Cluster.launch({
// //     concurrency: Cluster.CONCURRENCY_CONTEXT,
// //     maxConcurrency: MAX_CONCURRENCY,
// //     puppeteer: puppeteerExtra,

// //     puppeteerOptions: {
// //       headless: "new",
// //       args: [
// //         ...chromium.args,
// //         "--disable-blink-features=AutomationControlled", // stealth tweak
// //       ],

// //       executablePath:
// //         process.env.NODE_ENV === "production"
// //           ? await chromium.executablePath()
// //           : puppeteerExtra.executablePath(),
// //     },
// //     timeout: GOTO_TIMEOUT + 10000,
// //   });

// //   cluster.task(async ({ page, data: url, worker }) => {
// //     console.log(`Puppeteer Worker ${worker.id} started: ${url}`);
// //     await page.setUserAgent(
// //       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
// //     );
// //     await page.setViewport({ width: 1280, height: 800 });
// //     await page.setExtraHTTPHeaders({ "accept-language": "en-US,en;q=0.9" });

// //     try {
// //       await page.goto(url, {
// //         waitUntil: "domcontentloaded",
// //         timeout: GOTO_TIMEOUT,
// //       });
// //       await page
// //         .waitForSelector('meta[property="og:title"]', { timeout: 10000 })
// //         .catch(() => {});
// //       const content = await page.content();
// //       return content;
// //     } finally {
// //       console.log(`Puppeteer Worker ${worker.id} finished: ${url}`);
// //     }
// //   });
// // }

// async function initCluster() {
//   console.log("🔹 Starting Puppeteer cluster initialization...");

//   const isProduction = process.env.NODE_ENV === "production";
//   console.log("🔹 Environment:", process.env.NODE_ENV);

//   // Determine executable path
//   let executablePath;
//   try {
//     executablePath = isProduction
//       ? await chromium.executablePath()
//       : require("puppeteer").executablePath();

//     console.log("🔹 Executable path resolved:", executablePath);
//     if (!executablePath) {
//       console.warn("⚠️ Executable path is null or undefined!");
//     }
//   } catch (err) {
//     console.error("❌ Failed to get executable path:", err);
//     throw err;
//   }

//   // Test opening a browser manually
//   try {
//     console.log("🔹 Testing browser launch manually...");
//     const testBrowser = await puppeteerExtra.launch({
//       headless: chromium.headless,
//       args: [
//         ...chromium.args,
//         "--disable-blink-features=AutomationControlled",
//         "--no-sandbox",
//         "--disable-setuid-sandbox",
//         "--disable-dev-shm-usage",
//       ],
//       executablePath,
//       dumpio: true,
//     });

//     const page = await testBrowser.newPage();
//     console.log("✅ Successfully opened a test page");
//     await page.close();
//     await testBrowser.close();
//   } catch (err) {
//     console.error("❌ Failed to open a test page:", err);
//     throw err; // Stop here if browser can't launch
//   }

//   // Launch Puppeteer Cluster
//   try {
//     console.log("🔹 Launching Puppeteer Cluster...");
//     cluster = await Cluster.launch({
//       concurrency: isProduction
//         ? Cluster.CONCURRENCY_PAGE
//         : Cluster.CONCURRENCY_CONTEXT,
//       maxConcurrency: MAX_CONCURRENCY,
//       puppeteer: puppeteerExtra,
//       puppeteerOptions: {
//         headless: chromium.headless,
//         args: [
//           ...chromium.args,
//           "--disable-blink-features=AutomationControlled",
//           "--no-sandbox",
//           "--disable-setuid-sandbox",
//           "--disable-dev-shm-usage",
//         ],
//         executablePath,
//         dumpio: true,
//         timeout: GOTO_TIMEOUT,
//       },
//     });

//     console.log("✅ Puppeteer Cluster launched successfully!");
//   } catch (err) {
//     console.error("❌ Failed to launch Puppeteer Cluster:", err);
//     throw err;
//   }

//   // Define cluster task
//   cluster.task(async ({ page, data: url, worker }) => {
//     console.log(`🔹 Worker ${worker.id} started for URL:`, url);

//     try {
//       await page.setUserAgent(
//         "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
//       );
//       await page.setViewport({ width: 1280, height: 800 });
//       await page.setExtraHTTPHeaders({ "accept-language": "en-US,en;q=0.9" });

//       console.log(`🔹 Worker ${worker.id}: Navigating to URL...`);
//       await page.goto(url, {
//         waitUntil: "domcontentloaded",
//         timeout: GOTO_TIMEOUT,
//       });

//       console.log(`🔹 Worker ${worker.id}: Waiting for meta tag...`);
//       await page
//         .waitForSelector('meta[property="og:title"]', { timeout: 10000 })
//         .catch(() => {});

//       const content = await page.content();
//       console.log(`✅ Worker ${worker.id}: Finished scraping URL`);
//       return content;
//     } catch (err) {
//       console.error(`❌ Worker ${worker.id}: Error scraping URL`, err);
//       throw err;
//     } finally {
//       console.log(`🔹 Worker ${worker.id} finished processing URL:`, url);
//     }
//   });

//   console.log("🔹 Puppeteer cluster initialization complete!");
// }

// /* --- Utilities --- */
// function sanitizeUrl(url) {
//   try {
//     return encodeURI(url.trim());
//   } catch {
//     return url.trim();
//   }
// }

// async function expandUrl(shortUrl) {
//   const url = shortUrl.trim().startsWith("http")
//     ? shortUrl.trim()
//     : "https://" + shortUrl.trim();
//   try {
//     const res = await got(url, {
//       method: "HEAD",
//       followRedirect: true,
//       throwHttpErrors: false,
//       timeout: 10000,
//     });
//     return res.url || url;
//   } catch {
//     return url;
//   }
// }

// /* --- Fast-path scraping: Cheerio --- */
// // /* --- Scraper with Cheerio (fast) --- */
// async function scrapeWithCheerio(url) {
//   const { body } = await got(url, {
//     headers: { "user-agent": "Mozilla/5.0" },
//     timeout: { request: 15000 },
//   });

//   const $ = cheerio.load(body);

//   const getMeta = (name) =>
//     $(`meta[property='${name}']`).attr("content") ||
//     $(`meta[name='${name}']`).attr("content") ||
//     null;

//   return {
//     title: getMeta("og:title") || $("title").text() || null,
//     description: getMeta("og:description") || getMeta("description") || null,
//     image: getMeta("og:image") || getMeta("twitter:image") || null,
//     url: getMeta("og:url") || url,
//     video: getMeta("og:video") || getMeta("twitter:player") || null,
//   };
// }

// /* --- Scraper with Metascraper (fallback) --- */
// async function scrapeWithMetascraper(url) {
//   const { body } = await got(url, {
//     headers: { "user-agent": "Mozilla/5.0" },
//     timeout: { request: 15000 },
//   });
//   return metascraper({ html: body, url });
// }
// /* --- Puppeteer scraping with retries --- */
// async function scrapeWithPuppeteer(url, retries = PUPPETEER_RETRIES) {
//   if (!cluster) throw new Error("Puppeteer cluster not initialized");
//   try {
//     const queuedAt = Date.now();
//     const html = await cluster.execute(url);
//     console.log(
//       `URL ${url} waited ${((Date.now() - queuedAt) / 1000).toFixed(
//         2
//       )}s in queue`
//     );
//     const $ = cheerio.load(html || "");
//     const getMeta = (name) =>
//       $(`meta[property='${name}']`).attr("content") ||
//       $(`meta[name='${name}']`).attr("content") ||
//       null;

//     return {
//       title: getMeta("og:title") || $("title").text() || null,
//       description: getMeta("og:description") || getMeta("description") || null,
//       image: getMeta("og:image") || getMeta("twitter:image") || null,
//       url: getMeta("og:url") || url,
//       video: getMeta("og:video") || getMeta("twitter:player") || null,
//     };
//   } catch (err) {
//     if (retries > 0) return scrapeWithPuppeteer(url, retries - 1);
//     return null;
//   }
// }

// /* --- Detect JS-heavy sites --- */
// function isJsHeavySite(url) {
//   const jsHeavyHosts = ["barnesandnoble"];
//   try {
//     const hostname = new URL(url).hostname;
//     return jsHeavyHosts.some((h) => hostname.includes(h));
//   } catch {
//     return false;
//   }
// }

// /* --- Hybrid API Route --- */
// app.post("/preview", async (req, res) => {
//   let { url } = req.body;
//   if (!url) return res.status(400).json({ error: "Missing 'url'" });

//   try {
//     url = sanitizeUrl(await expandUrl(url));
//     let metadata = null;

//     if (isJsHeavySite(url)) {
//       console.log("Using Puppeteer-first for JS-heavy page:", url);
//       metadata = await scrapeWithPuppeteer(url);
//     } else {
//       // 1️⃣ Cheerio fast-path
//       metadata = await scrapeWithCheerio(url);
//       console.log("Cheerio result:", metadata);

//       // 2️⃣ Fallback to Metascraper
//       if (!metadata.title || !metadata.description || !metadata.image) {
//         console.log("⚠️ Falling back to Metascraper...", url);
//         metadata = await scrapeWithMetascraper(url);
//         console.log("Metascraper result:", metadata);
//       }

//       // 3️⃣ Final fallback: Puppeteer cluster
//       if (!metadata.title || !metadata.description || !metadata.image) {
//         console.log("⚠️ Falling back to Puppeteer Cluster...", url);
//         const puppeteerMeta = await scrapeWithPuppeteer(url);
//         if (puppeteerMeta) metadata = puppeteerMeta;
//       }
//     }

//     if (!metadata) {
//       metadata = {
//         title: "Failed to fetch metadata",
//         description: null,
//         image: null,
//         url,
//         video: null,
//       };
//     }

//     return res.json(metadata);
//   } catch (err) {
//     console.error("❌ Error fetching metadata:", err.stack || err);
//     return res.json({
//       title: "Couldn't fetch data",
//       description: "An error occurred while fetching metadata.",
//       image: null,
//       url,
//       video: null,
//     });
//   }
// });

// /* --- Start server --- */
// initCluster().then(() => {
//   const PORT = process.env.PORT || 3000;

//   app.listen(PORT, () => {
//     console.log(`🚀 Server running at port ${PORT}`);
//   });
// });

// /* --- Graceful shutdown --- */
// process.on("SIGINT", async () => {
//   console.log("Shutting down Puppeteer cluster...");
//   if (cluster) await cluster.close();
//   process.exit();
// });

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
const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const chromium = require("@sparticuz/chromium");
require("dotenv").config();

puppeteerExtra.use(StealthPlugin());

const app = express();
app.use(express.json());

/* --- Config --- */
const GOTO_TIMEOUT = 90000; // 60s for slow JS pages
const GOT_REQUEST_TIMEOUT = 20000;

let browser;
const isProduction = process.env.NODE_ENV === "production";
/* --- Initialize Puppeteer Browser --- */
async function initBrowser() {
  const executablePath = isProduction
    ? await chromium.executablePath()
    : require("puppeteer").executablePath();

  browser = await puppeteerExtra.launch({
    headless: chromium.headless,
    args: [
      ...chromium.args,
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
    executablePath,
    userDataDir: isProduction ? "/tmp/puppeteer_profile" : undefined,
    dumpio: true, // debug Chromium errors on Render
  });

  console.log("✅ Puppeteer browser launched!");
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

/* --- Scrapers --- */
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

async function scrapeWithMetascraper(url) {
  const { body } = await got(url, {
    headers: { "user-agent": "Mozilla/5.0" },
    timeout: { request: 15000 },
  });
  return metascraper({ html: body, url });
}

async function scrapeWithPuppeteer(url) {
  if (!browser) throw new Error("Puppeteer browser not initialized");

  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.90 Safari/537.36"
    );
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({ "accept-language": "en-US,en;q=0.9" });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    await page.goto(url, { waitUntil: "networkidle0", timeout: GOTO_TIMEOUT });
    await page.waitForTimeout(2000); // give JS time to populate OG tags

    const html = await page.content();
    const $ = cheerio.load(html);

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
  } finally {
    await page.close();
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

/* --- API Route --- */
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

      if (!metadata.title || !metadata.description || !metadata.image) {
        metadata = await scrapeWithMetascraper(url);
      }

      if (!metadata.title || !metadata.description || !metadata.image) {
        metadata = await scrapeWithPuppeteer(url);
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
initBrowser().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Server running at port ${PORT}`));
});

/* --- Graceful shutdown --- */
process.on("SIGINT", async () => {
  console.log("Shutting down Puppeteer browser...");
  if (browser) await browser.close();
  process.exit();
});
