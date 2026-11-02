import { defaultActions, toggleAction } from "../core/run.js"
import { applyTheme } from "./theme.js"

const modalChrome = `
<style>
  :host { all: initial; }
  .back {
    box-sizing: border-box;
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: color-mix(in srgb, var(--text) 35%, transparent);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--text);
    color-scheme: var(--scheme);
  }
  .modal {
    box-sizing: border-box;
    width: min(720px, 100%);
    max-height: min(80vh, 640px);
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--edge, color-mix(in srgb, var(--text) 22%, var(--bg)));
    border-radius: 16px;
    overflow: hidden;
  }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; }
  h2 { margin: 0; font-size: 20px; font-weight: 800; }
  button.close { border: 0; background: transparent; color: var(--accent); font-size: 17px; padding: 0; }
  .title { display: flex; align-items: center; gap: 10px; }
  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid color-mix(in srgb, var(--text) 25%, transparent);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex: none;
  }
  .spinner[hidden] { display: none; }
  @keyframes spin { to { transform: rotate(1turn); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
  .sheet { overflow: auto; height: calc(11 * 42px); flex: none; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; height: 20px; padding: 8px 12px; border-top: 1px solid var(--edge, color-mix(in srgb, var(--text) 22%, var(--bg))); vertical-align: top; line-height: 20px; }
  th { font-size: 13px; color: var(--muted); font-weight: 700; position: sticky; top: 0; background: var(--bg); z-index: 1; }
  td.text { white-space: pre-wrap; word-break: break-word; }
  input[type="checkbox"] { accent-color: var(--accent); width: 16px; height: 16px; }
  footer { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 16px; }
  button.primary { border: 0; border-radius: 999px; padding: 8px 16px; background: var(--btn-bg); color: var(--btn-text); font-weight: 700; font: inherit; }
  button.primary:disabled { opacity: 0.6; }
  footer label { display: flex; align-items: center; gap: 6px; font-size: 14px; }
</style>
<div class="back">
  <div class="modal" role="dialog" aria-modal="true" aria-label="Tweets encontrados">
    <header>
      <div class="title">
        <h2>Tweets encontrados</h2>
        <span class="spinner" role="status" aria-label="Carregando"></span>
      </div>
      <button class="close" type="button" data-action="close">Fechar</button>
    </header>
    <div class="sheet">
      <table>
        <thead><tr><th><input type="checkbox" data-action="all" checked aria-label="Marcar tudo"></th><th>Tipo</th><th>Data</th><th>Texto</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <footer>
      <button class="primary" type="button" data-action="execute" disabled>Executar</button>
      <label><input type="checkbox" data-choice="nuke"> Nuke</label>
      <label><input type="checkbox" data-choice="unretweet" checked> unretweet</label>
      <label><input type="checkbox" data-choice="deletePosts" checked> delete posts</label>
      <label><input type="checkbox" data-choice="deleteReplies" checked> delete replies</label>
    </footer>
  </div>
</div>`

export function modalMarkup() {
    return modalChrome
}

export function showDate(value) {
    if (!value) return ""
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    const day = String(date.getUTCDate()).padStart(2, "0")
    const month = String(date.getUTCMonth() + 1).padStart(2, "0")
    return `${day}/${month}/${date.getUTCFullYear()}`
}

export function openSearchModal(document, theme, onExecute) {
    const host = document.createElement("div")
    host.setAttribute("data-x-deleter-modal", "")
    const shadow = host.attachShadow({ mode: "open" })
    shadow.innerHTML = modalChrome
    applyTheme(shadow.querySelector(".back"), theme)
    host.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;"
    const body = shadow.querySelector("tbody")
    const rows = []
    const actions = defaultActions()
    const execute = shadow.querySelector("[data-action=execute]")
    const all = shadow.querySelector("[data-action=all]")
    const spinner = shadow.querySelector(".spinner")
    function paintAll() {
        const boxes = body.querySelectorAll('input[type="checkbox"]')
        const total = boxes.length
        let on = 0
        for (const box of boxes) if (box.checked) on += 1
        all.checked = total === 0 || on === total
        all.indeterminate = on > 0 && on < total
    }
    function paintActions() {
        for (const input of shadow.querySelectorAll("[data-choice]")) {
            input.checked = Boolean(actions[input.dataset.choice])
        }
    }
    const api = {
        stopped: false,
        enable() {
            spinner.hidden = true
            if (!api.stopped) execute.disabled = false
        },
        addTweet(tweet) {
            if (api.stopped) return
            const record = { ...tweet, selected: true }
            rows.push(record)
            const row = document.createElement("tr")
            const pick = document.createElement("td")
            const box = document.createElement("input")
            box.type = "checkbox"
            box.checked = true
            box.dataset.id = tweet.id
            box.addEventListener("change", () => {
                record.selected = box.checked
                paintAll()
            })
            pick.append(box)
            const type = document.createElement("td")
            type.textContent = tweet.type
            const date = document.createElement("td")
            date.textContent = showDate(tweet.date)
            const text = document.createElement("td")
            text.className = "text"
            text.textContent = tweet.text
            row.append(pick, type, date, text)
            body.append(row)
            paintAll()
        },
        close() {
            api.stopped = true
            host.remove()
        },
    }
    all.addEventListener("change", () => {
        all.indeterminate = false
        for (const record of rows) record.selected = all.checked
        for (const box of body.querySelectorAll('input[type="checkbox"]')) box.checked = all.checked
    })
    for (const input of shadow.querySelectorAll("[data-choice]")) {
        input.addEventListener("change", () => {
            Object.assign(actions, toggleAction(actions, input.dataset.choice, input.checked))
            paintActions()
        })
    }
    execute.addEventListener("click", () => {
        if (execute.disabled || !onExecute) return
        execute.disabled = true
        Promise.resolve(onExecute(rows.map((row) => ({ ...row })), { ...actions })).finally(() => {
            if (!api.stopped) execute.disabled = false
        })
    })
    shadow.querySelector("[data-action=close]").addEventListener("click", () => api.close())
    shadow.querySelector(".back").addEventListener("click", (event) => {
        if (event.target === event.currentTarget) api.close()
    })
    document.body.append(host)
    return api
}
