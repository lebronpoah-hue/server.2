const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/proxy", async (req, res) => {
  try {
    const target = req.query.url;
    if (!target) {
      return res.status(400).json({ error: "Missing ?url=" });
    }

    const response = await fetch(target, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
      redirect: "follow",
    });

    const contentType =
      response.headers.get("content-type") || "text/html; charset=utf-8";

    res.set("Content-Type", contentType);
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.set("Access-Control-Allow-Headers", "*");

    const text = await response.text();
    res.status(response.status).send(text);
  } catch (err) {
    console.error("proxy error:", err);
    res.status(500).send(
      "<html><body><h1>Proxy Error</h1><p>" +
        String(err.message) +
        "</p></body></html>"
    );
  }
});

app.post("/proxy", async (req, res) => {
  try {
    const target = req.body.url;
    if (!target) {
      return res.status(400).json({ error: "Missing url in body" });
    }

    const response = await fetch(target, {
      method: req.body.method || "POST",
      headers: req.body.headers || {},
      body: req.body.body || undefined,
      redirect: "follow",
    });

    const contentType =
      response.headers.get("content-type") || "text/plain; charset=utf-8";
    const text = await response.text();

    res.set("Content-Type", contentType);
    res.set("Access-Control-Allow-Origin", "*");
    res.status(response.status).send(text);
  } catch (err) {
    console.error("proxy post error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.options("/proxy", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.set("Access-Control-Allow-Headers", "*");
  res.sendStatus(204);
});

app.get("/", (req, res) => {
  res.send("Proxy server is running");
});

app.listen(PORT, () => {
  console.log("Proxy server running on port " + PORT);
});
