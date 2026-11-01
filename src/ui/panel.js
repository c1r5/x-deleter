import { applyTheme, sampleTheme } from "./theme.js"

const markup = `
<style>
  :host { all: initial; }
  .wrap {
    box-sizing: border-box;
    width: 380px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 8px 16px 16px;
    overflow: auto;
    background: var(--bg);
    color: var(--text);
    color-scheme: var(--scheme);
    border-left: 1px solid var(--line);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  header { display: flex; align-items: center; justify-content: space-between; min-height: 53px; }
  h2 { margin: 0; font-size: 20px; font-weight: 800; }
  button.icon { width: 34px; height: 34px; border: 0; border-radius: 999px; background: transparent; color: var(--text); }
  button.icon svg { width: 20px; height: 20px; }
  .logs { min-height: 96px; border-radius: 16px; padding: 12px 14px; background: var(--surface); font-family: ui-monospace, monospace; font-size: 13px; line-height: 1.5; }
  .progress { height: 4px; border-radius: 999px; background: var(--line); overflow: hidden; }
  .progress > span { display: block; height: 100%; width: 0; background: var(--accent); }
  .status-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 15px; }
  .status-row .k { color: var(--muted); }
  .pill { border-radius: 999px; padding: 2px 10px; font-weight: 700; font-size: 13px; background: var(--surface); color: var(--accent); }
  .quick { display: flex; flex-direction: column; gap: 8px; border-radius: 16px; padding: 12px 14px; background: var(--surface); }
  .quick h3 { margin: 0; font-size: 15px; font-weight: 800; }
  label { display: flex; align-items: center; gap: 8px; font-size: 15px; }
  label.field, label.date { flex-direction: column; align-items: stretch; gap: 4px; font-size: 13px; color: var(--muted); }
  .dates { display: flex; gap: 8px; }
  input, button.primary { font: inherit; color: var(--text); }
  input[type="checkbox"] { accent-color: var(--accent); width: 16px; height: 16px; }
  input[type="date"], input[type="text"] { border: 1px solid var(--line); border-radius: 4px; padding: 8px 10px; background: var(--bg); }
  button.primary { border: 0; border-radius: 999px; padding: 8px 16px; background: var(--btn-bg); color: var(--btn-text); font-weight: 700; }
  .file { display: none; }
  .file.on { display: flex; justify-content: space-between; }
  button.file-btn { border: 1px solid var(--line); border-radius: 999px; background: var(--bg); color: var(--text); padding: 6px 12px; }
</style>
<div class="wrap">
  <header>
    <h2>Tweet deleter</h2>
    <button class="icon" type="button" aria-label="Configurações Avançadas">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6"/></svg>
    </button>
  </header>
  <div class="logs"></div>
  <div>
    <div class="progress"><span></span></div>
    <div class="status-row"><span class="k">status</span> <span class="pill">idle</span></div>
  </div>
  <section class="quick">
    <h3>Configurações rápidas</h3>
    <label><input type="checkbox" data-field="fromArchive"> Do arquivo</label>
    <label><input type="checkbox" data-field="unretweet" checked> Desfazer retweets</label>
    <label><input type="checkbox" data-field="keepPinned" checked> Manter o fixado</label>
    <label><input type="checkbox" data-field="urlsOnly"> Só com link</label>
    <label><input type="checkbox" data-field="oldTweets"> Tweets antigos</label>
    <div class="dates">
      <label class="date">De <input type="date" data-field="afterDate" value="1900-01-01"></label>
      <label class="date">Até <input type="date" data-field="beforeDate" value="2026-10-30"></label>
    </div>
    <label class="field">Palavras <input type="text" data-field="keywords"></label>
    <label class="field">Ignorar estes IDs <input type="text" data-field="ignoreIds"></label>
    <label class="field">Apagar só estes IDs <input type="text" data-field="onlyIds"></label>
    <div class="file"><span>Arquivo do export</span><button class="file-btn" type="button">Escolher</button></div>
    <button class="primary" type="button">Apagar</button>
  </section>
</div>`

export function panelMarkup() {
    return markup
}

export function mountPanel(document, view, onStart) {
    const host = document.createElement("div")
    host.style.cssText = "position:fixed;top:0;right:0;width:380px;height:100vh;z-index:2147483647;"
    const shadow = host.attachShadow({ mode: "open" })
    shadow.innerHTML = markup
    const root = shadow.querySelector(".wrap")
    const logs = shadow.querySelector(".logs")
    const bar = shadow.querySelector(".progress > span")
    const pill = shadow.querySelector(".pill")
    const fileRow = shadow.querySelector(".file")
    let fileText = ""

    function paint() {
        applyTheme(root, sampleTheme(document, view))
    }
    paint()
    const observer = new view.MutationObserver(paint)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] })
    observer.observe(document.body, { attributes: true, attributeFilter: ["style", "class"] })

    shadow.querySelector("[data-field=fromArchive]").addEventListener("change", (event) => {
        fileRow.classList.toggle("on", event.target.checked)
    })
    shadow.querySelector(".file-btn").addEventListener("click", () => {
        const input = document.createElement("input")
        input.type = "file"
        input.onchange = () => {
            const file = input.files && input.files[0]
            if (!file) return
            const reader = new view.FileReader()
            reader.onload = () => {
                fileText = String(reader.result || "")
            }
            reader.readAsText(file)
        }
        input.click()
    })
    shadow.querySelector(".primary").addEventListener("click", () => {
        const fields = {}
        for (const input of shadow.querySelectorAll("[data-field]")) {
            fields[input.dataset.field] = input.type === "checkbox" ? input.checked : input.value
        }
        onStart(fields, fileText, panel)
    })

    const panel = {
        log(line) {
            const row = document.createElement("div")
            row.textContent = line
            logs.append(row)
        },
        progress({ done, total }) {
            bar.style.width = total ? `${(done / total) * 100}%` : "0"
        },
        setStatus(status) {
            pill.textContent = status
        },
    }
    document.body.append(host)
    return panel
}
