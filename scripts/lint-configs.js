#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const JSON_FILES = [
  "app.json",
  "project.config.json",
  "sitemap.json"
];

function readJson(filePath) {
  const abs = path.join(ROOT, filePath);
  const raw = fs.readFileSync(abs, "utf-8");
  try {
    return { file: filePath, data: JSON.parse(raw) };
  } catch (error) {
    throw new Error(`${filePath} 解析失败: ${error.message}`);
  }
}

function ensureArray(value, file, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${file} 字段 ${field} 需要为非空数组`);
  }
}

function ensureString(value, file, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${file} 字段 ${field} 需要为非空字符串`);
  }
}

function main() {
  const results = [];
  for (const file of JSON_FILES) {
    results.push(readJson(file));
  }

  const appJson = results.find((item) => item.file === "app.json");
  if (appJson) {
    ensureArray(appJson.data.pages, "app.json", "pages");
    if (appJson.data.cloud && typeof appJson.data.cloud === "object") {
      ensureString(appJson.data.cloud.env, "app.json", "cloud.env");
    }
  }

  const projectConfig = results.find((item) => item.file === "project.config.json");
  if (projectConfig) {
    ensureString(projectConfig.data.appid, "project.config.json", "appid");
  }

  console.log("✅ JSON 配置文件检查通过。");
}

try {
  main();
} catch (error) {
  console.error(`❌ 验收失败: ${error.message}`);
  process.exit(1);
}
