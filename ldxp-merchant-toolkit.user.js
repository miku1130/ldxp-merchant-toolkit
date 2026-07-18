// ==UserScript==
// @name         链动小铺商家增强工具
// @namespace    https://www.ldxp.cn/
// @version      1.1.0
// @description  货源广场增强搜索与一键对接；商品管理批量修改分类、价格、状态并复制文字报表。
// @author       miku1130
// @license      MIT
// @homepageURL  https://github.com/miku1130/ldxp-merchant-toolkit
// @supportURL   https://github.com/miku1130/ldxp-merchant-toolkit/issues
// @match        https://www.ldxp.cn/merchant/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const APP_ID = "ldxp-merchant-toolkit";
  const STYLE_ID = `${APP_ID}-style`;
  const SOURCE_PATH = "/merchant/my_parent/source_square";
  const GOODS_PATH = "/merchant/goods/list";

  const API = {
    sourceSearch: "/merchantApi/MyParent/searchGoodsList",
    sourceConnect: "/merchantApi/MyParent/fetchConnectGoods",
    goodsList: "/merchantApi/Goods/list",
    goodsInfo: "/merchantApi/Goods/info",
    goodsUpdate: "/merchantApi/Goods/update",
    goodsStatus: "/merchantApi/Goods/statusUpdate",
    categoryList: "/merchantApi/GoodsCategory/listAll",
    goodsLink: "/merchantApi/Goods/getLink",
  };

  const GOODS_TYPES = {
    card: "卡密",
    article: "知识",
    resource: "资源",
    equity: "权益",
  };

  const sourceState = {
    raw: [],
    filtered: [],
    selected: new Set(),
    loading: false,
  };

  const goodsState = {
    rawItems: [],
    items: [],
    selected: new Set(),
    categories: [],
    loading: false,
    goodsType: "card",
  };

  function getToken() {
    try {
      const raw = localStorage.getItem("auth-token");
      if (!raw) return "";
      try {
        const parsed = JSON.parse(raw);
        return parsed?.value || parsed?.token || "";
      } catch (_) {
        return raw;
      }
    } catch (_) {
      return "";
    }
  }

  async function postJson(url, body) {
    if (!url.startsWith("/merchantApi/")) {
      throw new Error("已阻止非站内接口请求");
    }
    const token = getToken();
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        ...(token ? { "Merchant-Token": token } : {}),
      },
      body: JSON.stringify(body || {}),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (result.code !== 1) throw new Error(result.msg || "接口请求失败");
    return result.data;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toNumber(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(String(value).replace(/[^\d.-]/g, ""));
    return Number.isFinite(number) ? number : null;
  }

  function money(value) {
    const number = toNumber(value);
    return number === null ? "-" : `¥${number.toFixed(2)}`;
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ""), location.origin);
      if (url.protocol !== "https:" && url.protocol !== "http:") return "#";
      return url.href;
    } catch (_) {
      return "#";
    }
  }

  function notify(message, type = "info") {
    let toast = document.getElementById(`${APP_ID}-toast`);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = `${APP_ID}-toast`;
      document.body.appendChild(toast);
    }
    toast.className = `ldxp-toolkit-toast ${type}`;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => {
      toast.hidden = true;
    }, 3500);
  }

  function setBusy(button, busy, text = "处理中...") {
    if (!(button instanceof HTMLButtonElement)) return;
    if (busy) {
      button.dataset.oldText = button.textContent || "";
      button.textContent = text;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.oldText || button.textContent;
      button.disabled = false;
    }
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .ldxp-toolkit-launcher {
        position: fixed; right: 22px; bottom: 24px; z-index: 2147483646;
        height: 42px; padding: 0 18px; border: 0; border-radius: 22px;
        color: #fff; background: #165dff; box-shadow: 0 10px 28px rgba(22,93,255,.3);
        font-size: 14px; font-weight: 700; cursor: pointer;
      }
      .ldxp-toolkit-panel {
        position: fixed; top: 76px; right: 22px; z-index: 2147483647;
        width: min(1120px, calc(100vw - 44px)); height: min(760px, calc(100vh - 100px));
        min-height: min(420px, calc(100vh - 100px)); max-height: calc(100vh - 100px);
        display: flex; flex-direction: column; overflow: hidden; resize: both;
        color: #1d2939; background: #fff; border: 1px solid #d0d5dd; border-radius: 10px;
        box-shadow: 0 20px 60px rgba(15,23,42,.24); font: 14px/1.45 Arial,"Microsoft YaHei",sans-serif;
      }
      .ldxp-toolkit-panel[hidden] { display: none !important; }
      .ldxp-toolkit-panel > [data-panel-body] {
        flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;
      }
      .ldxp-toolkit-head {
        display: flex; align-items: center; gap: 12px; padding: 12px 14px;
        flex: 0 0 auto; background: #f8fafc; border-bottom: 1px solid #eaecf0; user-select: none;
      }
      .ldxp-toolkit-title { font-size: 16px; font-weight: 700; white-space: nowrap; }
      .ldxp-toolkit-contact { color: #475467; font-size: 12px; white-space: nowrap; }
      .ldxp-toolkit-contact strong { color: #165dff; }
      .ldxp-toolkit-status { flex: 1; min-width: 0; color: #667085; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ldxp-toolkit-controls {
        display: grid; grid-template-columns: repeat(6,minmax(125px,1fr)); gap: 10px;
        flex: 0 0 auto; max-height: 38vh; overflow-y: auto;
        padding: 12px 14px; border-bottom: 1px solid #eaecf0;
      }
      .ldxp-toolkit-controls label { display: flex; flex-direction: column; gap: 4px; color: #667085; font-size: 12px; }
      .ldxp-toolkit-controls input, .ldxp-toolkit-controls select, .ldxp-toolkit-report textarea {
        box-sizing: border-box; width: 100%; min-height: 34px; padding: 6px 9px;
        color: #1d2939; background: #fff; border: 1px solid #d0d5dd; border-radius: 6px; outline: none;
      }
      .ldxp-toolkit-actions { display: flex; align-items: end; gap: 8px; flex-wrap: wrap; }
      .ldxp-toolkit-panel button {
        min-height: 32px; padding: 0 12px; color: #344054; background: #fff;
        border: 1px solid #d0d5dd; border-radius: 6px; cursor: pointer;
      }
      .ldxp-toolkit-panel button.primary { color: #fff; border-color: #165dff; background: #165dff; }
      .ldxp-toolkit-panel button.success { color: #fff; border-color: #079455; background: #079455; }
      .ldxp-toolkit-panel button.danger { color: #b42318; border-color: #fda29b; background: #fff; }
      .ldxp-toolkit-panel button:disabled { opacity: .55; cursor: not-allowed; }
      .ldxp-toolkit-table-wrap { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
      .ldxp-toolkit-table { width: 100%; min-width: 980px; border-collapse: collapse; }
      .ldxp-toolkit-table th, .ldxp-toolkit-table td { padding: 9px 8px; border-bottom: 1px solid #eaecf0; text-align: left; vertical-align: top; }
      .ldxp-toolkit-table th { position: sticky; top: 0; z-index: 1; color: #667085; background: #f8fafc; font-size: 12px; }
      .ldxp-toolkit-table a { color: #165dff; text-decoration: none; }
      .ldxp-toolkit-table .name { min-width: 250px; max-width: 420px; word-break: break-word; }
      .ldxp-toolkit-muted { color: #98a2b3; }
      .ldxp-toolkit-badge { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
      .ldxp-toolkit-badge.ok { color: #067647; background: #ecfdf3; }
      .ldxp-toolkit-badge.warn { color: #b54708; background: #fffaeb; }
      .ldxp-toolkit-empty { padding: 36px; color: #667085; text-align: center; }
      .ldxp-toolkit-footer { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; padding: 10px 14px; background: #fff; border-top: 1px solid #eaecf0; }
      .ldxp-toolkit-footer .spacer { flex: 1; }
      .ldxp-toolkit-report { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; background: rgba(15,23,42,.4); }
      .ldxp-toolkit-report[hidden] { display: none; }
      .ldxp-toolkit-report-box { width: min(720px,calc(100vw - 40px)); padding: 16px; background: #fff; border-radius: 10px; box-shadow: 0 20px 60px rgba(15,23,42,.3); }
      .ldxp-toolkit-report textarea { height: min(60vh,520px); margin: 12px 0; resize: vertical; font: 13px/1.65 Consolas,"Microsoft YaHei",monospace; }
      .ldxp-toolkit-report-actions { display: flex; justify-content: flex-end; gap: 8px; }
      .ldxp-toolkit-toast { position: fixed; left: 50%; top: 26px; transform: translateX(-50%); z-index: 2147483647; padding: 10px 16px; color: #fff; background: #344054; border-radius: 7px; box-shadow: 0 8px 24px rgba(15,23,42,.22); }
      .ldxp-toolkit-toast.success { background: #067647; }
      .ldxp-toolkit-toast.error { background: #b42318; }
      @media (max-width: 1000px) { .ldxp-toolkit-controls { grid-template-columns: repeat(3,minmax(125px,1fr)); } }
    `;
    document.head.appendChild(style);
  }

  function createLauncher(text, onClick) {
    const button = document.createElement("button");
    button.className = "ldxp-toolkit-launcher";
    button.textContent = text;
    button.addEventListener("click", onClick);
    document.body.appendChild(button);
    return button;
  }

  function createPanel(title) {
    const panel = document.createElement("section");
    panel.className = "ldxp-toolkit-panel";
    panel.innerHTML = `
      <div class="ldxp-toolkit-head">
        <div class="ldxp-toolkit-title">${escapeHtml(title)}</div>
        <div class="ldxp-toolkit-contact">QQ交流群：<strong>1076144676</strong></div>
        <div class="ldxp-toolkit-status">准备就绪</div>
        <button type="button" data-close>关闭</button>
      </div>
      <div data-panel-body></div>
    `;
    panel.querySelector("[data-close]").addEventListener("click", () => {
      panel.hidden = true;
    });
    document.body.appendChild(panel);
    return panel;
  }

  function setPanelStatus(panel, message) {
    const status = panel.querySelector(".ldxp-toolkit-status");
    if (status) status.textContent = message;
  }

  function getSourceCost(item) {
    const candidates = [item.cost_price, item.agent_price_limit, item.agent_price1, item.agent_price2, item.agent_price3]
      .map(toNumber)
      .filter((value) => value !== null && value >= 0);
    return candidates.length ? candidates[0] : null;
  }

  function getSourceStock(item) {
    if (item.goods_type !== "card") return null;
    const value = toNumber(item.stock_count ?? item.extend?.stock_count);
    return value === null ? 0 : value;
  }

  function sourceMatches(item, filters) {
    const price = getSourceCost(item);
    const stock = getSourceStock(item);
    const minPrice = toNumber(filters.minPrice);
    const maxPrice = toNumber(filters.maxPrice);
    if (minPrice !== null && (price === null || price < minPrice)) return false;
    if (maxPrice !== null && (price === null || price > maxPrice)) return false;
    if (filters.stock === "in" && stock !== null && stock <= 0) return false;
    if (filters.stock === "out" && stock !== 0) return false;
    if (filters.connect === "yes" && !item.child) return false;
    if (filters.connect === "no" && item.child) return false;
    return true;
  }

  function mountSourceTool() {
    const panel = createPanel("货源广场增强搜索");
    const body = panel.querySelector("[data-panel-body]");
    body.innerHTML = `
      <div class="ldxp-toolkit-controls">
        <label>关键词<input data-source="keywords" placeholder="商品名称关键词"></label>
        <label>商品类型<select data-source="goodsType">${Object.entries(GOODS_TYPES).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
        <label>拉取页数<input data-source="maxPages" type="number" min="1" max="50" value="5"></label>
        <label>最低成本<input data-source="minPrice" type="number" min="0" step="0.01" placeholder="不限"></label>
        <label>最高成本<input data-source="maxPrice" type="number" min="0" step="0.01" placeholder="不限"></label>
        <label>库存<select data-source="stock"><option value="all">全部</option><option value="in">有库存</option><option value="out">缺货</option></select></label>
        <label>对接状态<select data-source="connect"><option value="all">全部</option><option value="no">未对接</option><option value="yes">已对接</option></select></label>
        <label>默认加价比例（%）<input data-source="addRate" type="number" min="0" step="0.1" value="10"></label>
        <div class="ldxp-toolkit-actions">
          <button type="button" class="primary" data-source-action="search">增强搜索</button>
          <button type="button" data-source-action="filter">应用筛选</button>
        </div>
      </div>
      <div class="ldxp-toolkit-table-wrap" data-source-results><div class="ldxp-toolkit-empty">输入关键词后点击“增强搜索”</div></div>
      <div class="ldxp-toolkit-footer">
        <label><input type="checkbox" data-source-select-all> 全选当前结果</label>
        <span data-source-count>已选 0 项</span>
        <span class="spacer"></span>
        <button type="button" class="success" data-source-action="batch-connect">选中一键对接</button>
      </div>
    `;

    function readSourceFilters() {
      const result = {};
      body.querySelectorAll("[data-source]").forEach((input) => {
        result[input.dataset.source] = input.value.trim();
      });
      result.maxPages = Math.max(1, Math.min(50, Number(result.maxPages) || 1));
      result.addRate = Math.max(0, Number(result.addRate) || 0);
      return result;
    }

    function updateSourceCount() {
      body.querySelector("[data-source-count]").textContent = `已选 ${sourceState.selected.size} 项`;
    }

    function renderSourceResults() {
      const wrap = body.querySelector("[data-source-results]");
      if (sourceState.loading) {
        wrap.innerHTML = '<div class="ldxp-toolkit-empty">正在拉取货源...</div>';
        return;
      }
      if (!sourceState.filtered.length) {
        wrap.innerHTML = '<div class="ldxp-toolkit-empty">当前条件下没有结果</div>';
        updateSourceCount();
        return;
      }
      wrap.innerHTML = `
        <table class="ldxp-toolkit-table">
          <thead><tr><th>选择</th><th>商品</th><th>类型</th><th>成本</th><th>库存</th><th>商家</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>${sourceState.filtered.map((item) => {
            const stock = getSourceStock(item);
            const connected = Boolean(item.child);
            return `<tr>
              <td><input type="checkbox" data-source-id="${escapeHtml(item.id)}" ${sourceState.selected.has(String(item.id)) ? "checked" : ""}></td>
              <td class="name"><a href="${escapeHtml(safeUrl(item.link))}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.name || "-")}</a></td>
              <td>${escapeHtml(GOODS_TYPES[item.goods_type] || item.goods_type || "-")}</td>
              <td>${escapeHtml(money(getSourceCost(item)))}</td>
              <td>${stock === null ? '<span class="ldxp-toolkit-muted">无需库存</span>' : escapeHtml(stock)}</td>
              <td>${escapeHtml(item.user?.nickname || "-")}</td>
              <td><span class="ldxp-toolkit-badge ${connected ? "ok" : "warn"}">${connected ? "已对接" : "未对接"}</span></td>
              <td><button type="button" class="${connected ? "" : "success"}" data-connect-id="${escapeHtml(item.id)}" ${connected ? "disabled" : ""}>${connected ? "已对接" : "一键对接"}</button></td>
            </tr>`;
          }).join("")}</tbody>
        </table>`;
      updateSourceCount();
    }

    function applySourceFilters() {
      const filters = readSourceFilters();
      sourceState.filtered = sourceState.raw.filter((item) => sourceMatches(item, filters));
      sourceState.filtered.sort((a, b) => (getSourceCost(a) ?? Infinity) - (getSourceCost(b) ?? Infinity));
      sourceState.selected = new Set([...sourceState.selected].filter((id) => sourceState.filtered.some((item) => String(item.id) === id)));
      renderSourceResults();
      setPanelStatus(panel, `共拉取 ${sourceState.raw.length} 条，筛选后 ${sourceState.filtered.length} 条`);
    }

    async function searchSource(button) {
      const filters = readSourceFilters();
      if (!filters.keywords) {
        notify("请先输入关键词", "error");
        return;
      }
      setBusy(button, true, "搜索中...");
      sourceState.loading = true;
      sourceState.raw = [];
      sourceState.filtered = [];
      sourceState.selected.clear();
      renderSourceResults();
      try {
        const pageSize = 50;
        let total = Infinity;
        for (let current = 1; current <= filters.maxPages && sourceState.raw.length < total; current += 1) {
          setPanelStatus(panel, `正在拉取第 ${current}/${filters.maxPages} 页...`);
          const data = await postJson(API.sourceSearch, {
            current,
            pageSize,
            name: "",
            goods_type: filters.goodsType,
            keywords: filters.keywords,
          });
          const list = Array.isArray(data?.list) ? data.list : [];
          total = Number(data?.total) || sourceState.raw.length + list.length;
          sourceState.raw.push(...list);
          if (list.length < pageSize) break;
        }
        sourceState.loading = false;
        applySourceFilters();
      } catch (error) {
        sourceState.loading = false;
        renderSourceResults();
        setPanelStatus(panel, error.message || String(error));
        notify(error.message || String(error), "error");
      } finally {
        setBusy(button, false);
      }
    }

    async function connectSourceItems(ids, button) {
      const targets = ids.filter((id) => {
        const item = sourceState.raw.find((entry) => String(entry.id) === String(id));
        return item && !item.child;
      });
      if (!targets.length) {
        notify("没有可对接的未对接商品", "error");
        return;
      }
      const { addRate } = readSourceFilters();
      if (!confirm(`确定对接 ${targets.length} 个商品吗？\n默认按成本价加价 ${addRate}% 建立商品。`)) return;
      setBusy(button, true, "对接中...");
      try {
        const data = await postJson(API.sourceConnect, {
          add_type: 1,
          add_rate: addRate,
          add_price: 0,
          name_sync: 1,
          description_sync: 1,
          goods_ids: targets.map((id) => Number(id)),
        });
        targets.forEach((id) => {
          const item = sourceState.raw.find((entry) => String(entry.id) === String(id));
          if (item) item.child = item.child || { connected: true };
          sourceState.selected.delete(String(id));
        });
        applySourceFilters();
        notify(typeof data === "string" ? data : `成功对接 ${targets.length} 个商品`, "success");
      } catch (error) {
        notify(error.message || String(error), "error");
      } finally {
        setBusy(button, false);
      }
    }

    body.addEventListener("click", (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) return;
      const actionButton = target.closest("[data-source-action]");
      if (actionButton?.dataset.sourceAction === "search") searchSource(actionButton);
      if (actionButton?.dataset.sourceAction === "filter") applySourceFilters();
      if (actionButton?.dataset.sourceAction === "batch-connect") connectSourceItems([...sourceState.selected], actionButton);
      const connectButton = target.closest("[data-connect-id]");
      if (connectButton) connectSourceItems([connectButton.dataset.connectId], connectButton);
    });

    body.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      if (target.matches("[data-source-id]")) {
        const id = String(target.dataset.sourceId);
        target.checked ? sourceState.selected.add(id) : sourceState.selected.delete(id);
        updateSourceCount();
      }
      if (target.matches("[data-source-select-all]")) {
        sourceState.filtered.forEach((item) => {
          const id = String(item.id);
          target.checked ? sourceState.selected.add(id) : sourceState.selected.delete(id);
        });
        renderSourceResults();
      }
    });

    panel.hidden = true;
    createLauncher("增强货源搜索", () => {
      panel.hidden = !panel.hidden;
    });
  }

  function itemStock(item) {
    if ((item.goods_type || goodsState.goodsType) !== "card") return "无需库存";
    const stock = toNumber(item.extend?.stock_count ?? item.stock_count);
    return String(stock ?? 0);
  }

  function createReportModal() {
    const modal = document.createElement("div");
    modal.className = "ldxp-toolkit-report";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="ldxp-toolkit-report-box">
        <strong>商品文字报表</strong>
        <textarea data-report-text readonly></textarea>
        <div class="ldxp-toolkit-report-actions">
          <button type="button" data-report-close>关闭</button>
          <button type="button" class="primary" data-report-copy>复制全部文字</button>
        </div>
      </div>`;
    modal.querySelector("[data-report-close]").addEventListener("click", () => {
      modal.hidden = true;
    });
    modal.querySelector("[data-report-copy]").addEventListener("click", async () => {
      const text = modal.querySelector("[data-report-text]").value;
      try {
        await navigator.clipboard.writeText(text);
        notify("报表文字已复制", "success");
      } catch (_) {
        const textarea = modal.querySelector("[data-report-text]");
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        notify("报表文字已复制", "success");
      }
    });
    document.body.appendChild(modal);
    return modal;
  }

  function mountGoodsTool() {
    const panel = createPanel("商品管理批量工具");
    const reportModal = createReportModal();
    const body = panel.querySelector("[data-panel-body]");
    body.innerHTML = `
      <div class="ldxp-toolkit-controls">
        <label>商品类型<select data-goods="goodsType">${Object.entries(GOODS_TYPES).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
        <label>商品状态<select data-goods="status"><option value="999">全部</option><option value="1">销售中</option><option value="0">仓库中</option></select></label>
        <label>筛选分类搜索<input data-goods-filter-category-search placeholder="输入分类名称"></label>
        <label>筛选分类<select data-goods="filterCategory"><option value="">全部分类</option></select></label>
        <label>商品名称<input data-goods="name" placeholder="留空查询全部"></label>
        <label>库存筛选<select data-goods="stockFilter"><option value="all">全部库存</option><option value="in">有库存</option><option value="out">缺货</option></select></label>
        <label>价格排序<select data-goods="priceSort"><option value="default">默认顺序</option><option value="asc">价格从低到高</option><option value="desc">价格从高到低</option></select></label>
        <label>拉取页数<input data-goods="maxPages" type="number" min="1" max="20" value="1"></label>
        <label>每页数量<select data-goods="pageSize"><option>20</option><option selected>50</option><option>100</option></select></label>
        <div class="ldxp-toolkit-actions"><button type="button" class="primary" data-goods-action="load">加载商品</button></div>
        <label>搜索分类选项<input data-goods-category-search placeholder="输入分类名称"></label>
        <label>修改为分类<select data-goods="category"><option value="">保持不变</option></select></label>
        <label>价格修改<select data-goods="priceMode"><option value="keep">保持不变</option><option value="fixed">统一价格</option><option value="percent">按比例调整</option><option value="add">统一加减金额</option></select></label>
        <label>价格数值<input data-goods="priceValue" type="number" step="0.01" placeholder="如 19.9 / 10 / -2"></label>
        <label>上下架状态<select data-goods="newStatus"><option value="">保持不变</option><option value="1">销售中</option><option value="0">仓库中</option></select></label>
        <div class="ldxp-toolkit-actions"><button type="button" class="success" data-goods-action="batch-edit">保存选中修改</button></div>
      </div>
      <div class="ldxp-toolkit-table-wrap" data-goods-results><div class="ldxp-toolkit-empty">点击“加载商品”后，在这里勾选需要处理的商品</div></div>
      <div class="ldxp-toolkit-footer">
        <label><input type="checkbox" data-goods-select-all> 全选当前结果</label>
        <span data-goods-count>已选 0 项</span>
        <span class="spacer"></span>
        <button type="button" data-goods-action="report">生成并复制文字报表</button>
      </div>`;

    function flattenCategories(categories, parents = []) {
      const result = [];
      (Array.isArray(categories) ? categories : []).forEach((category) => {
        const value = category.value ?? category.id;
        const name = category.label ?? category.name ?? (value !== undefined ? `分类 ${value}` : "未命名分类");
        const path = [...parents, String(name)];
        if (value !== undefined && value !== null && value !== "") {
          result.push({ value: String(value), label: path.join(" / ") });
        }
        const children = category.children ?? category.child ?? category.list;
        if (Array.isArray(children) && children.length) {
          result.push(...flattenCategories(children, path));
        }
      });
      return result;
    }

    function categoryLabelForItem(item) {
      const categoryString = typeof item.category === "string" ? item.category.trim() : "";
      const direct =
        (categoryString && !/^\d+$/.test(categoryString) ? categoryString : "") ||
        item.category?.name ||
        item.category?.label ||
        item.category_name ||
        item.category_title;
      if (direct) return direct;
      const categoryId = item.category_id ?? item.category?.id ?? item.category?.value ?? (categoryString || item.category);
      const matched = goodsState.categories.find((category) => String(category.value) === String(categoryId));
      if (matched) return matched.label;
      return categoryId !== undefined && categoryId !== null && categoryId !== "" ? `分类 ID：${categoryId}` : "未分类";
    }

    function fillCategorySelect(select, emptyLabel, searchText = "") {
      if (!(select instanceof HTMLSelectElement)) return;
      const oldValue = select.value;
      const keyword = searchText.trim().toLowerCase();
      const options = goodsState.categories.filter((category) => !keyword || category.label.toLowerCase().includes(keyword));
      select.innerHTML = "";
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = emptyLabel;
      select.appendChild(empty);
      options.forEach((category) => {
        const option = document.createElement("option");
        option.value = category.value;
        option.textContent = category.label;
        select.appendChild(option);
      });
      if ([...select.options].some((option) => option.value === oldValue)) select.value = oldValue;
    }

    function renderCategorySelects() {
      fillCategorySelect(
        body.querySelector('[data-goods="filterCategory"]'),
        "全部分类",
        body.querySelector("[data-goods-filter-category-search]")?.value || "",
      );
      fillCategorySelect(
        body.querySelector('[data-goods="category"]'),
        "保持不变",
        body.querySelector("[data-goods-category-search]")?.value || "",
      );
    }

    function readGoodsControls() {
      const values = {};
      body.querySelectorAll("[data-goods]").forEach((input) => {
        values[input.dataset.goods] = input.value.trim();
      });
      values.maxPages = Math.max(1, Math.min(20, Number(values.maxPages) || 1));
      values.pageSize = Math.max(20, Math.min(100, Number(values.pageSize) || 50));
      return values;
    }

    function updateGoodsCount() {
      body.querySelector("[data-goods-count]").textContent = `已选 ${goodsState.selected.size} 项`;
    }

    function sortGoodsItems() {
      const sort = body.querySelector('[data-goods="priceSort"]')?.value || "default";
      if (sort === "default") return;
      goodsState.items.sort((a, b) => {
        const priceA = toNumber(a.price);
        const priceB = toNumber(b.price);
        if (priceA === null && priceB === null) return 0;
        if (priceA === null) return 1;
        if (priceB === null) return -1;
        return sort === "desc" ? priceB - priceA : priceA - priceB;
      });
    }

    function applyGoodsDisplay() {
      const stockFilter = body.querySelector('[data-goods="stockFilter"]')?.value || "all";
      goodsState.items = goodsState.rawItems.filter((item) => {
        if (stockFilter === "all") return true;
        if ((item.goods_type || goodsState.goodsType) !== "card") return false;
        const stock = toNumber(item.extend?.stock_count ?? item.stock_count) ?? 0;
        return stockFilter === "in" ? stock > 0 : stock <= 0;
      });
      const visibleIds = new Set(goodsState.items.map((item) => String(item.id)));
      goodsState.selected = new Set([...goodsState.selected].filter((id) => visibleIds.has(id)));
      sortGoodsItems();
      renderGoodsResults();
    }

    function renderGoodsResults() {
      const wrap = body.querySelector("[data-goods-results]");
      if (goodsState.loading) {
        wrap.innerHTML = '<div class="ldxp-toolkit-empty">正在加载商品...</div>';
        return;
      }
      if (!goodsState.items.length) {
        wrap.innerHTML = '<div class="ldxp-toolkit-empty">没有查到商品</div>';
        updateGoodsCount();
        return;
      }
      wrap.innerHTML = `
        <table class="ldxp-toolkit-table">
          <thead><tr><th>选择</th><th>ID</th><th>商品名称</th><th>分类</th><th>库存</th><th>价格</th><th>状态</th></tr></thead>
          <tbody>${goodsState.items.map((item) => `<tr>
            <td><input type="checkbox" data-goods-id="${escapeHtml(item.id)}" ${goodsState.selected.has(String(item.id)) ? "checked" : ""}></td>
            <td>${escapeHtml(item.id)}</td>
            <td class="name">${escapeHtml(item.name || "-")}</td>
            <td>${escapeHtml(categoryLabelForItem(item))}</td>
            <td>${escapeHtml(itemStock(item))}</td>
            <td>${escapeHtml(money(item.price))}</td>
            <td><span class="ldxp-toolkit-badge ${item.status === 1 ? "ok" : "warn"}">${item.status === 1 ? "销售中" : "仓库中"}</span></td>
          </tr>`).join("")}</tbody>
        </table>`;
      updateGoodsCount();
    }

    async function loadCategories(goodsType) {
      try {
        const data = await postJson(API.categoryList, { goods_type: goodsType });
        goodsState.categories = flattenCategories(data);
        renderCategorySelects();
      } catch (error) {
        notify(`分类加载失败：${error.message || error}`, "error");
      }
    }

    async function loadGoods(button) {
      const controls = readGoodsControls();
      goodsState.loading = true;
      goodsState.goodsType = controls.goodsType;
      goodsState.rawItems = [];
      goodsState.items = [];
      goodsState.selected.clear();
      renderGoodsResults();
      setBusy(button, true, "加载中...");
      try {
        await loadCategories(controls.goodsType);
        let total = Infinity;
        for (let current = 1; current <= controls.maxPages && goodsState.rawItems.length < total; current += 1) {
          setPanelStatus(panel, `正在加载第 ${current}/${controls.maxPages} 页...`);
          const data = await postJson(API.goodsList, {
            current,
            pageSize: controls.pageSize,
            goods_type: controls.goodsType,
            status: Number(controls.status),
            name: controls.name,
            category_id: controls.filterCategory ? Number(controls.filterCategory) : undefined,
            is_proxy: new URLSearchParams(location.search).get("is_proxy") || "1",
          });
          const list = Array.isArray(data?.list) ? data.list : [];
          total = Number(data?.total) || goodsState.items.length + list.length;
          goodsState.rawItems.push(...list);
          if (list.length < controls.pageSize) break;
        }
        applyGoodsDisplay();
        setPanelStatus(panel, `已拉取 ${goodsState.rawItems.length} 个，当前显示 ${goodsState.items.length} 个商品`);
      } catch (error) {
        goodsState.loading = false;
        renderGoodsResults();
        notify(error.message || String(error), "error");
      } finally {
        goodsState.loading = false;
        renderGoodsResults();
        setBusy(button, false);
      }
    }

    function selectedGoods() {
      return goodsState.items.filter((item) => goodsState.selected.has(String(item.id)));
    }

    function calculatePrice(oldPrice, mode, value) {
      const price = Math.max(0, toNumber(oldPrice) ?? 0);
      if (mode === "fixed") return Math.max(0, value);
      if (mode === "percent") return Math.max(0, Math.round(price * (1 + value / 100) * 100) / 100);
      if (mode === "add") return Math.max(0, Math.round((price + value) * 100) / 100);
      return price;
    }

    async function batchEdit(button) {
      const items = selectedGoods();
      if (!items.length) {
        notify("请先勾选商品", "error");
        return;
      }
      const controls = readGoodsControls();
      const categoryId = controls.category;
      const priceMode = controls.priceMode;
      const priceValue = toNumber(controls.priceValue);
      const status = controls.newStatus;
      if (!categoryId && priceMode === "keep" && status === "") {
        notify("请至少选择一个需要修改的字段", "error");
        return;
      }
      if (priceMode !== "keep" && priceValue === null) {
        notify("请输入价格修改数值", "error");
        return;
      }
      const categoryLabel = body.querySelector('[data-goods="category"] option:checked')?.textContent || "保持不变";
      const changes = [
        categoryId ? `分类：${categoryLabel}` : "",
        priceMode !== "keep" ? `价格方式：${{ fixed: "统一价格", percent: "按比例调整", add: "加减金额" }[priceMode]} ${priceValue}` : "",
        status !== "" ? `状态：${status === "1" ? "销售中" : "仓库中"}` : "",
      ].filter(Boolean).join("\n");
      if (!confirm(`即将修改 ${items.length} 个商品：\n${changes}\n\n操作会直接保存到店铺，确定继续吗？`)) return;

      setBusy(button, true, "保存中...");
      let success = 0;
      const failures = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        setPanelStatus(panel, `正在保存 ${index + 1}/${items.length}：${item.name}`);
        try {
          if (categoryId || priceMode !== "keep") {
            const info = await postJson(API.goodsInfo, { id: item.id });
            const payload = JSON.parse(JSON.stringify(info || {}));
            if (!payload.id) payload.id = item.id;
            if (categoryId) payload.category_id = Number(categoryId);
            if (priceMode !== "keep") payload.price = calculatePrice(payload.price, priceMode, priceValue);
            await postJson(API.goodsUpdate, payload);
          }
          if (status !== "") {
            await postJson(API.goodsStatus, { id: item.id, status: Number(status) });
          }
          success += 1;
        } catch (error) {
          failures.push(`${item.name}：${error.message || error}`);
        }
      }
      setBusy(button, false);
      setPanelStatus(panel, `批量修改完成：成功 ${success}，失败 ${failures.length}`);
      if (failures.length) {
        alert(`成功 ${success} 个，失败 ${failures.length} 个：\n\n${failures.join("\n")}`);
      } else {
        notify(`成功修改 ${success} 个商品`, "success");
      }
      await loadGoods(body.querySelector('[data-goods-action="load"]'));
    }

    async function buildReport(button) {
      const items = selectedGoods();
      if (!items.length) {
        notify("请先勾选商品", "error");
        return;
      }
      setBusy(button, true, "生成中...");
      const blocks = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        setPanelStatus(panel, `正在获取链接 ${index + 1}/${items.length}...`);
        let link = safeUrl(item.link);
        if (link === "#") {
          try {
            const data = await postJson(API.goodsLink, { id: item.id });
            link = safeUrl(data?.link || data?.short_link);
          } catch (_) {
            link = "获取失败";
          }
        }
        blocks.push([
          `商品名称：${item.name || "-"}`,
          `库存：${itemStock(item)}`,
          `价格：${money(item.price)}`,
          `链接：${link}`,
        ].join("\n"));
      }
      const report = blocks.join("\n\n--------------------\n\n");
      reportModal.querySelector("[data-report-text]").value = report;
      reportModal.hidden = false;
      try {
        await navigator.clipboard.writeText(report);
        notify("文字报表已生成并复制", "success");
      } catch (_) {
        notify("报表已生成，请点击“复制全部文字”", "info");
      }
      setPanelStatus(panel, `已生成 ${items.length} 个商品的文字报表`);
      setBusy(button, false);
    }

    body.addEventListener("click", (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) return;
      const button = target.closest("[data-goods-action]");
      if (!button) return;
      const action = button.dataset.goodsAction;
      if (action === "load") loadGoods(button);
      if (action === "batch-edit") batchEdit(button);
      if (action === "report") buildReport(button);
    });

    body.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      if (target.matches("[data-goods-id]")) {
        const id = String(target.dataset.goodsId);
        target.checked ? goodsState.selected.add(id) : goodsState.selected.delete(id);
        updateGoodsCount();
      }
      if (target.matches("[data-goods-select-all]")) {
        goodsState.items.forEach((item) => {
          const id = String(item.id);
          target.checked ? goodsState.selected.add(id) : goodsState.selected.delete(id);
        });
        renderGoodsResults();
      }
      if (target.matches('[data-goods="goodsType"]')) {
        goodsState.categories = [];
        body.querySelector("[data-goods-filter-category-search]").value = "";
        body.querySelector("[data-goods-category-search]").value = "";
        loadCategories(target.value);
      }
      if (target.matches('[data-goods="priceSort"]')) {
        applyGoodsDisplay();
      }
      if (target.matches('[data-goods="stockFilter"]')) {
        applyGoodsDisplay();
        setPanelStatus(panel, `已拉取 ${goodsState.rawItems.length} 个，当前显示 ${goodsState.items.length} 个商品`);
      }
    });

    body.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.matches("[data-goods-filter-category-search]")) {
        fillCategorySelect(body.querySelector('[data-goods="filterCategory"]'), "全部分类", target.value);
      }
      if (target.matches("[data-goods-category-search]")) {
        fillCategorySelect(body.querySelector('[data-goods="category"]'), "保持不变", target.value);
      }
    });

    panel.hidden = true;
    createLauncher("商品批量工具", () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden && !goodsState.categories.length) loadCategories(readGoodsControls().goodsType);
    });
  }

  function mount() {
    if (document.getElementById(APP_ID)) return;
    installStyles();
    const marker = document.createElement("div");
    marker.id = APP_ID;
    marker.hidden = true;
    document.body.appendChild(marker);
    if (location.pathname === SOURCE_PATH) mountSourceTool();
    if (location.pathname === GOODS_PATH) mountGoodsTool();
  }

  function boot() {
    let lastPath = `${location.pathname}${location.search}`;
    mount();
    const observer = new MutationObserver(() => {
      const currentPath = `${location.pathname}${location.search}`;
      if (currentPath !== lastPath) {
        lastPath = currentPath;
        document.querySelectorAll(`.ldxp-toolkit-launcher,.ldxp-toolkit-panel,.ldxp-toolkit-report,#${APP_ID}`).forEach((node) => node.remove());
        mount();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
