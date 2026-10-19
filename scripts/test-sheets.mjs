import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  emptyState,
  currentMonth,
  localDate,
} from "../app/public/modules/domain.mjs";

const root = resolve("dist/web");
const state = emptyState();
state.revision = 1;
state.plan = {
  assets: [
    { id: "gold", name: "黄金", kind: "investment" },
    { id: "index", name: "A500", kind: "investment" },
  ],
  months: [{ month: currentMonth(), targets: { gold: 230000, index: 150000 } }],
  notes: "",
};
state.records = Array.from({ length: 20 }, (_, i) => ({
  id: "record_" + i,
  assetId: "gold",
  assetName: "黄金",
  date: localDate(),
  amount: 100,
}));
const mime = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
};
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    res.setHeader("Cache-Control", "no-store");
    if (path === "/") {
      res.setHeader("Content-Type", mime[".html"]);
      return res.end(
        '<!doctype html><style>body{margin:0;background:#101010}iframe{display:block;border:0;width:390px;height:844px}</style><iframe id="subject"></iframe><script type="module" src="/tests.js"></script>',
      );
    }
    if (path === "/tests.js") {
      res.setHeader("Content-Type", mime[".js"]);
      return res.end(await readFile("scripts/sheets-browser.mjs"));
    }
    if (path === "/fixture") {
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify(state));
    }
    if (path === "/api/config") {
      if (req.method === "POST") {
        for await (const chunk of req) {
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({
          baseUrl: "https://api.deepseek.com",
          model: "deepseek-flash",
          configured: false,
        }),
      );
    }
    if (!path.startsWith("/app/")) {
      res.writeHead(404);
      return res.end();
    }
    const file = resolve(root, path.slice(5) || "index.html");
    if (!file.startsWith(root + sep)) {
      res.writeHead(403);
      return res.end();
    }
    let bytes = await readFile(file);
    if (extname(file) === ".html")
      bytes = Buffer.from(
        bytes
          .toString()
          .replace(
            "<head>",
            '<head><script>window.__errors=[];addEventListener("error",e=>__errors.push(e.message));addEventListener("unhandledrejection",e=>__errors.push(String(e.reason)));</script>',
          ),
      );
    res.setHeader(
      "Content-Type",
      mime[extname(file)] || "application/octet-stream",
    );
    res.end(bytes);
  } catch (error) {
    res.writeHead(500);
    res.end(error.message);
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const execute = promisify(execFile);
async function cli(args) {
  const { stdout } = await execute(
    "powershell.exe",
    ["-NoProfile", "-Command", `agent-browser --session allot-sheets ${args}`],
    { windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 },
  );
  return stdout;
}
try {
  await cli("set viewport 390 844");
  await cli("open " + url);
  if (!process.argv.includes("--pointer-only")) {
    const code = Buffer.from("window.sheetTests.run()").toString("base64");
    const response = JSON.parse((await cli("--json eval -b " + code)).trim());
    if (!response.success) throw new Error(response.error);
    await mkdir(".allot", { recursive: true });
    await writeFile(
      ".allot/sheet-test-results.json",
      JSON.stringify(response.data.result, null, 2),
    );
    console.log(JSON.stringify(response.data.result, null, 2));
  }
  const preview = Buffer.from(
    '(async()=>{await sheetTests.load(await (await fetch("/fixture")).json());const d=document.querySelector("iframe").contentDocument;d.getElementById("open-calendar").click();await new Promise(r=>setTimeout(r,100));d.querySelector("#calendar-grid .invested:not(.outside)").click();await sheetTests.settled("calendar-day-dialog").catch(e=>{throw Error(e.message+JSON.stringify({errors:document.querySelector("iframe").contentWindow.__errors,dialogs:[...d.querySelectorAll("dialog")].map(x=>({id:x.id,open:x.open,phase:x.dataset.phase})),day:d.querySelector("#calendar-grid .invested:not(.outside)").outerHTML}));});const r=d.querySelector("#calendar-day-dialog .sheet-grip").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+18};})()',
  ).toString("base64");
  const {
    data: { result: point },
  } = JSON.parse((await cli("--json eval -b " + preview)).trim());
  console.log(await cli("screenshot " + resolve(".allot/sheet-collapsed.png")));
  const events = Buffer.from(
    'window.pointerLog=[];const d=document.querySelector("iframe").contentDocument;for(const t of ["pointerdown","pointermove","pointerup","lostpointercapture","click"])d.addEventListener(t,e=>pointerLog.push({t,y:e.clientY,target:e.target.className,trusted:e.isTrusted}),true)',
  ).toString("base64");
  await cli("--json eval -b " + events);
  await cli(`mouse move ${Math.round(point.x)} ${Math.round(point.y)}`);
  await cli("mouse down");
  await cli(`mouse move ${Math.round(point.x)} ${Math.round(point.y - 140)}`);
  await cli("mouse up");
  const trusted = Buffer.from(
    '(async()=>{await sheetTests.settled("calendar-day-dialog");const d=document.querySelector("iframe").contentDocument.getElementById("calendar-day-dialog");if(d.dataset.expanded!=="true"||!pointerLog.some(e=>e.t==="pointermove"&&e.trusted&&e.target==="sheet-grip"))throw Error("Trusted pointer did not expand drawer");return "trusted pointer capture expands calendar drawer";})()',
  ).toString("base64");
  console.log(
    JSON.parse((await cli("--json eval -b " + trusted)).trim()).data.result,
  );
  console.log(await cli("screenshot " + resolve(".allot/sheet-expanded.png")));
  const assetPointCode = Buffer.from(
    '(async()=>{await sheetTests.load(await (await fetch("/fixture")).json());const row=document.querySelector("iframe").contentDocument.querySelector("[data-asset-id=gold]");const r=row.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()',
  ).toString("base64");
  const { data: { result: assetPoint } } = JSON.parse((await cli("--json eval -b " + assetPointCode)).trim());
  await cli(`mouse move ${Math.round(assetPoint.x)} ${Math.round(assetPoint.y)}`);
  await cli("mouse down");
  await cli("--json eval -b " + Buffer.from('new Promise(r=>setTimeout(r,470))').toString("base64"));
  await cli("mouse up");
  const assetCheck = Buffer.from(
    '(async()=>{await sheetTests.settled("asset-detail-dialog");const d=document.querySelector("iframe").contentDocument;if(d.querySelector("[data-asset-id=gold]").getAttribute("aria-pressed")==="true")throw Error("Long press also selected asset");return "trusted pointer long press opens asset drawer without selecting";})()',
  ).toString("base64");
  console.log(JSON.parse((await cli("--json eval -b " + assetCheck)).trim()).data.result);
  console.log(await cli("screenshot " + resolve(".allot/asset-detail.png")));
} catch (error) {
  if (error.stdout) console.error(error.stdout);
  throw error;
} finally {
  await cli("close").catch(() => {});
  server.close();
}
