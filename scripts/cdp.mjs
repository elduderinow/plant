// Minimal CDP driver: open a page, optionally click, screenshot.
// Usage: node scripts/cdp.mjs <url> <out.png> [x,y | text:... | shot:file.png ...]
const [, , url, out, ...clicks] = process.argv;
const PORT = process.env.CDP_PORT || 9223;

const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, {
  method: "PUT",
});
const target = await res.json();

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const waiting = new Map();
const logs = [];

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && waiting.has(msg.id)) {
    waiting.get(msg.id)(msg);
    waiting.delete(msg.id);
  }
  if (msg.method === "Runtime.consoleAPICalled") {
    logs.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
  }
  if (msg.method === "Runtime.exceptionThrown") {
    logs.push("EXCEPTION " + msg.params.exceptionDetails.text);
  }
};

const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id;
    waiting.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1000,
  height: 800,
  deviceScaleFactor: 1,
  mobile: false,
});

await wait(Number(process.env.CDP_WAIT || 9000));

for (const action of clicks) {
  if (action.startsWith("text:")) {
    await send("Input.insertText", { text: action.slice(5) });
    await wait(300);
    continue;
  }
  if (action.startsWith("shot:")) {
    const frame = await send("Page.captureScreenshot", { format: "png" });
    const { writeFileSync: w } = await import("node:fs");
    w(action.slice(5), Buffer.from(frame.result.data, "base64"));
    continue;
  }
  const [x, y] = action.split(",").map(Number);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
  await wait(250);
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
    buttons: 1,
  });
  await wait(60);
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
    buttons: 0,
  });
  await wait(500);
}

const shot = await send("Page.captureScreenshot", { format: "png" });
const { writeFileSync } = await import("node:fs");
writeFileSync(out, Buffer.from(shot.result.data, "base64"));

console.log(logs.join("\n") || "(no console output)");
ws.close();
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
