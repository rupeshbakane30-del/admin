const API_BASE = "https://api.tallyxml.online";
const TABLE_PAGE_SIZE = 20;

let msgTimer = null;
const tableState = new WeakMap();

function setMsg(text, ok = true) {
  const el = document.getElementById("msg");
  if (!el) return;

  window.clearTimeout(msgTimer);
  el.textContent = text;
  el.className = `msg ${ok ? "ok" : "err"}`;
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });

  msgTimer = window.setTimeout(() => {
    el.textContent = "";
    el.className = "msg";
  }, 5000);
}

function setToken(token) {
  document.cookie = `admin_token=${encodeURIComponent(token)}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax; Secure`;
}

function getToken() {
  const row = document.cookie.split("; ").find(part => part.startsWith("admin_token="));
  return row ? decodeURIComponent(row.split("=")[1]) : "";
}

function logout() {
  document.cookie = "admin_token=; path=/; max-age=0; SameSite=Lax; Secure";
  window.location.href = "index.html";
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = getToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (opts.json) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.json);
    delete opts.json;
  }

  try {
    const res = await fetch(API_BASE + path, {
      ...opts,
      headers
    });

    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await res.json().catch(() => ({ error: "Invalid response from server" }))
      : await res.text();

    if (!res.ok) {
      const errorMsg = typeof data === "string"
        ? data
        : data.error || `HTTP ${res.status}: Request failed`;
      throw new Error(errorMsg);
    }

    return data;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Network error: Unable to reach server. Check your connection.");
    }
    throw error;
  }
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCurrency(amount) {
  const value = Number(amount || 0);
  return `Rs ${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0
  }).format(value)}`;
}

function formatValue(key, value) {
  if (value === null || value === undefined || value === "") return "-";
  if (key.toLowerCase().includes("revenue") || key.toLowerCase().includes("amount_rs")) {
    return formatCurrency(value);
  }
  return String(value);
}

function toCsv(rows, headers) {
  return [
    headers.join(","),
    ...rows.map(row => headers.map(header => {
      const value = formatValue(header, row[header]);
      return `"${String(value).replace(/"/g, "\"\"")}"`;
    }).join(","))
  ].join("\n");
}

function downloadTextFile(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getTableTitle(el) {
  const card = el.closest(".card");
  const heading = card?.querySelector(".card-header h3");
  return heading?.textContent?.trim() || "table";
}

function renderTable(el) {
  const state = tableState.get(el);
  if (!state) return;

  const headers = state.rows.length ? Object.keys(state.rows[0]) : [];
  const query = state.query.trim().toLowerCase();
  const filteredRows = !query
    ? state.rows
    : state.rows.filter(row =>
        headers.some(header => formatValue(header, row[header]).toLowerCase().includes(query))
      );

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / TABLE_PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), totalPages);

  const startIndex = totalRows ? (state.page - 1) * TABLE_PAGE_SIZE : 0;
  const endIndex = Math.min(startIndex + TABLE_PAGE_SIZE, totalRows);
  const pageRows = filteredRows.slice(startIndex, endIndex);

  if (!headers.length) {
    el.innerHTML = "<p class=\"empty-state\">No data available</p>";
    return;
  }

  const desktopTable = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${pageRows.map(row => `
            <tr>
              ${headers.map(header => `<td>${escapeHtml(formatValue(header, row[header]))}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  const mobileCards = `
    <div class="mobile-table-cards">
      ${pageRows.map((row, index) => `
        <article class="mobile-data-card">
          <div class="mobile-data-card-title">${escapeHtml(getTableTitle(el))} Row ${startIndex + index + 1}</div>
          ${headers.map(header => `
            <div class="mobile-data-item">
              <span>${escapeHtml(header)}</span>
              <strong>${escapeHtml(formatValue(header, row[header]))}</strong>
            </div>
          `).join("")}
        </article>
      `).join("")}
    </div>
  `;

  const summaryText = totalRows
    ? `Showing ${startIndex + 1}-${endIndex} of ${totalRows}`
    : "No matching rows";

  el.innerHTML = `
    <div class="data-toolbar">
      <div class="data-toolbar-left">
        <span class="toolbar-chip">${escapeHtml(getTableTitle(el))}</span>
        <span class="toolbar-meta">${summaryText}</span>
      </div>
      <div class="data-toolbar-actions">
        <input
          class="table-search"
          type="search"
          placeholder="Search rows"
          value="${escapeHtml(state.query)}"
          aria-label="Search ${escapeHtml(getTableTitle(el))}"
        >
        <button type="button" class="btn-light table-action" data-action="export">Export CSV</button>
      </div>
    </div>
    ${pageRows.length ? desktopTable : "<p class=\"empty-state\">No matching rows</p>"}
    ${pageRows.length ? mobileCards : ""}
    <div class="table-pagination">
      <button type="button" class="btn-light table-action" data-action="prev" ${state.page <= 1 ? "disabled" : ""}>Previous</button>
      <span class="toolbar-meta">Page ${state.page} of ${totalPages}</span>
      <button type="button" class="btn-light table-action" data-action="next" ${state.page >= totalPages ? "disabled" : ""}>Next</button>
    </div>
  `;

  const searchInput = el.querySelector(".table-search");
  const buttons = el.querySelectorAll(".table-action");

  searchInput?.addEventListener("input", event => {
    state.query = event.target.value;
    state.page = 1;
    renderTable(el);
  });

  buttons.forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "prev" && state.page > 1) {
        state.page -= 1;
        renderTable(el);
      }
      if (action === "next" && state.page < totalPages) {
        state.page += 1;
        renderTable(el);
      }
      if (action === "export") {
        const csv = toCsv(filteredRows, headers);
        const safeName = getTableTitle(el).toLowerCase().replace(/[^a-z0-9]+/g, "-");
        downloadTextFile(csv, `${safeName || "table"}.csv`, "text/csv;charset=utf-8");
      }
    });
  });
}

function table(el, rows) {
  if (!el) return;
  tableState.set(el, {
    rows: Array.isArray(rows) ? rows : [],
    page: 1,
    query: ""
  });
  renderTable(el);
}

function setFormPending(form, pending) {
  if (!form) return;
  form.classList.toggle("is-loading", pending);

  const controls = form.querySelectorAll("button, input, textarea, select");
  controls.forEach(control => {
    if (control.tagName === "BUTTON") {
      control.disabled = pending;
    } else if (control.type !== "hidden") {
      control.disabled = pending;
    }
  });
}

function wireFormSubmit(form, handler) {
  form.addEventListener("submit", async event => {
    event.preventDefault();
    setFormPending(form, true);

    try {
      await handler();
    } catch (error) {
      setMsg(error.message || "Request failed", false);
    } finally {
      setFormPending(form, false);
    }
  });
}
