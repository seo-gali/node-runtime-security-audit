const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const tls = require('node:tls');
const zlib = require('node:zlib');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');

const checks = [];
const load = (manifest) => createRequire(manifest);
const playwrightManifest = 'C:/Users/user/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/@playwright/mcp/package.json';
const context7Entry = 'C:/Users/user/AppData/Local/npm-cache/_npx/eea2bd7412d4593b/node_modules/@upstash/context7-mcp/dist/index.js';
const crawlerRoots = ['D:/01_Programming/03_NodeJS/comment-crawler', 'D:/01_Programming/03_NodeJS/vibeCrawling'];

function mcpCheck(name, entry, expectedTool) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '';
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.end();
      child.kill();
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error(`${name}: MCP timeout`)), 20000);
    const send = (message) => child.stdin.write(JSON.stringify(message) + '\n');
    child.stderr.resume();
    child.on('error', (error) => finish(error));
    child.on('exit', (code) => { if (!settled) finish(new Error(`${name}: early exit ${code}`)); });
    child.stdout.on('data', (data) => {
      buffer += data;
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        try {
          const response = JSON.parse(line);
          if (response.error) throw new Error(`${name}: MCP error ${response.error.code}`);
          if (response.id === 1) {
            assert.ok(response.result.serverInfo.name);
            send({ jsonrpc: '2.0', method: 'notifications/initialized' });
            send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
          } else if (response.id === 2) {
            assert.ok(response.result.tools.some((tool) => tool.name === expectedTool));
            finish(null, { name, tools: response.result.tools.length, version: process.version });
          }
        } catch (error) { finish(error); }
      }
    });
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'node-security-check', version: '1' },
    } });
  });
}

async function main() {
  assert.equal(process.version, 'v24.22.1');
  assert.equal(process.versions.modules, '137');
  await assert.rejects(async () => require('node:dns').promises.resolve('localhost\0.invalid'), { code: 'ERR_INVALID_ARG_VALUE' });
  assert.equal(tls.checkServerIdentity('example.com', { subjectaltname: 'DNS:example.net' }).code, 'ERR_TLS_CERT_ALTNAME_INVALID');
  const payload = Buffer.from('node-security-check');
  assert.deepEqual(zlib.brotliDecompressSync(zlib.brotliCompressSync(payload)), payload);
  checks.push({ name: 'version, native ABI, DNS NUL rejection, TLS mismatch, Brotli round trip', passed: true });

  const html = '<!doctype html><meta charset="utf-8"><title>Node check</title><p class="item">crawler-ok</p><button onclick="this.textContent=\'clicked\'">check</button>';
  const server = http.createServer((request, response) => {
    if (request.url === '/compressed') {
      response.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'br' });
      response.end(zlib.brotliCompressSync(payload));
    } else {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(html);
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    for (let attempt = 0; attempt < 2; attempt++) assert.equal(await (await fetch(url + '/compressed')).text(), payload.toString());
    checks.push({ name: 'HTTP server and fetch Brotli responses, repeated requests', passed: true });
    for (const root of crawlerRoots) {
      const dependency = load(root + '/package.json');
      assert.equal(typeof dependency('express'), 'function');
      const response = await dependency('axios').get(url, { proxy: false, timeout: 5000 });
      assert.equal(dependency('cheerio').load(response.data)('.item').text(), 'crawler-ok');
      const puppeteer = dependency('puppeteer');
      const systemChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
      const chrome = fs.existsSync(systemChrome) ? systemChrome : puppeteer.executablePath();
      assert.ok(chrome, `${root}: Chrome executable missing`);
      const browser = await puppeteer.launch({ headless: true, executablePath: chrome });
      try {
        const page = await browser.newPage();
        await page.goto(url);
        assert.equal(await page.$eval('.item', (element) => element.textContent), 'crawler-ok');
      } finally { await browser.close(); }
      checks.push({ name: root, passed: true, tested: 'Express load, Axios HTTP, Cheerio parse, Puppeteer headless extraction', browserExecutable: chrome });
    }
    const browser = await load(playwrightManifest)('playwright').chromium.launch({ channel: 'chrome', headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url);
      await page.getByRole('button', { name: 'check', exact: true }).click();
      assert.equal(await page.getByRole('button').textContent(), 'clicked');
      checks.push({ name: 'Playwright browser navigation and DOM interaction', passed: true });
    } finally { await browser.close(); }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  checks.push(await mcpCheck('Playwright MCP', playwrightManifest.replace('package.json', 'cli.js'), 'browser_navigate'));
  checks.push(await mcpCheck('Context7 MCP', context7Entry, 'resolve-library-id'));
  return { pid: process.pid, version: process.version, execPath: process.execPath, abi: process.versions.modules, checks };
}

main().then((report) => console.log(JSON.stringify(report, null, 2))).catch((error) => {
  console.error(JSON.stringify({ version: process.version, checks, error: error.message }, null, 2));
  process.exitCode = 1;
});
